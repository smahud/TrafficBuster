/**
 * BACKEND - lib/jobManager.js (UPDATED - TODOLIST 17)
 * Credit: smahud - 2025-11-14 20:38:00 UTC
 * 
 * CHANGES:
 * - Add history tracking (create on start, update on stop/complete)
 * - Race condition prevention (stop previous job before start new)
 * - Periodic history updates (every 10 flows)
 * - Track impressions & clicks in history
 */

'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const { EventEmitter } = require('events');
const datasetStore = require('./datasetStore'); 
const historyManager = require('./historyManager'); // ** NEW **

const JOBS_DIR = path.join(__dirname, '..', 'jobs');
const MAX_CONCURRENT_JOBS_PER_USER = 1;

const jobs = new Map(); // <jobId, Job>
const userJobs = new Map(); // <userId, Set<jobId>>

class Job extends EventEmitter {
  constructor(user, matrix, datasetRefs) {
    super();
    this.jobId = 'job_' + crypto.randomBytes(8).toString('hex');
    this.userId = user.username;
    this.status = 'pending';
    this.matrix = matrix;
    this.datasetRefs = datasetRefs;
    this.config = null;
    this.historyId = null; // ** NEW **
    this.stats = {
      totalFlows: 0,
      doneFlows: 0,
      totalClicks: 0,
      doneClicks: 0,
      success: 0,
      fail: 0,
      startTime: null
    };
    this.timer = null;
    this.emitToUser = (type, payload) => {
      console.warn(`[Job ${this.jobId}] emitToUser (unpatched): ${type}`);
    };
  }

  async loadAsync() {
    this.status = 'loading';
    this.emitStatus();

    const { targetSet, proxySet, platformSet, settingsProfile, overrides } = this.datasetRefs;
    const userId = this.userId;

    try {
      // 1. Muat Settings (WAJIB)
      const settings = await datasetStore.getDataset(userId, 'settings', settingsProfile);
      if (!settings || typeof settings !== 'object') {
        throw new Error(`DATASET_NOT_FOUND: settings profile '${settingsProfile}' not found or empty`);
      }
      
      // 2. Muat Targets (WAJIB)
      const targets = await datasetStore.getDataset(userId, 'targets', targetSet);
      if (!targets || targets.length === 0) {
        throw new Error(`DATASET_NOT_FOUND: targets dataset '${targetSet}' not found or empty`);
      }

      // 3. Muat Proxies (Opsional)
      let proxies = [];
      if (proxySet) {
        if (!this.matrix.allowProxies) {
           throw new Error(`VALIDATION_ERROR: License does not allow proxies (feature: allowProxies)`);
        }
        try {
           proxies = await datasetStore.getDataset(userId, 'proxies', proxySet);
        } catch(e) {
           if (e.message === 'DATASET_NOT_FOUND') {
             this.emitLog('warn', `Proxy set '${proxySet}' not found, continuing without proxies.`);
           } else throw e;
        }
      }
      
      // 4. Muat Platforms (Opsional)
      let platforms = [];
      if (platformSet) {
        if (!this.matrix.allowPlatformCustom) {
           throw new Error(`VALIDATION_ERROR: License does not allow custom platforms (feature: allowPlatformCustom)`);
        }
         try {
           platforms = await datasetStore.getDataset(userId, 'platforms', platformSet);
         } catch(e) {
           if (e.message === 'DATASET_NOT_FOUND') {
             this.emitLog('warn', `Platform set '${platformSet}' not found, continuing without platforms.`);
           } else throw e;
         }
      }

      // 5. Gabungkan dan terapkan Overrides
      this.config = {
        ...settings, 
        ...overrides, 
        
        loadedData: {
          targets: targets,
          proxies: proxies,
          platforms: platforms
        }
      };
      
      this.stats.totalFlows = targets.reduce((sum, t) => sum + (t.flowTarget || 0), 0);
      this.stats.totalClicks = targets.reduce((sum, t) => sum + (t.clickTarget || 0), 0);
      
      try {
        await fs.mkdir(JOBS_DIR, { recursive: true });
        const jobFile = path.join(JOBS_DIR, `${this.jobId}.json`);
        await fs.writeFile(jobFile, JSON.stringify(this.config, null, 2), 'utf8');
      } catch (e) {
        console.warn(`[Job ${this.jobId}] Failed to save job config snapshot: ${e.message}`);
      }

    } catch (e) {
      this.status = 'failed';
      this.emitStatus();
      this.emitLog('error', `Failed to load job data: ${e.message}`);
      throw e; 
    }
  }

  // ** UPDATED: Add history tracking **
  startSimulator() {
    this.status = 'running';
    this.stats.startTime = Date.now();
    this.emitStatus();
    this.emitLog('info', 'Job started (simulator mode)');
    this.emitLog('info', `Total flows to execute: ${this.stats.totalFlows}`);
    this.emitLog('info', `Total clicks to execute: ${this.stats.totalClicks}`);
    
    let workQueue = this.config.loadedData.targets
      .filter(t => t.flowTarget > 0)
      .map(t => ({ ...t, remaining: t.flowTarget })); 
      
    if (workQueue.length === 0) {
       this.emitLog('warn', 'No targets found with flowTarget > 0. Job stopping.');
       this.stop();
       return;
    }

    const instanceCount = Math.min(
      this.config.instanceCount || 1,
      this.matrix.maxInstances || 1 
    );
    
    this.emitLog('info', `Running with ${instanceCount} concurrent instances (Limit: ${this.matrix.maxInstances})`);

    const intervalMs = Math.max(this.config.delayBetweenFlows?.min || 1000, 100);

    this.timer = setInterval(() => {
      if (this.status !== 'running') return;

      for (let i = 0; i < instanceCount; i++) {
        if (workQueue.length === 0) {
          this.emitLog('info', 'All flows completed.');
          
          // ** UPDATE HISTORY AS COMPLETED **
          if (this.historyId) {
            const stopTime = new Date().toISOString();
            const duration = this.stats.startTime 
              ? Math.floor((Date.now() - this.stats.startTime) / 1000) 
              : 0;
            
            historyManager.updateHistory(this.historyId, {
              stopTime: stopTime,
              status: 'completed',
              duration: duration,
              stats: {
                totalFlow: this.stats.totalFlows,
                flowDone: this.stats.doneFlows,
                impressions: this.stats.doneFlows,
                clicks: this.stats.doneClicks,
                failedFlow: this.stats.fail
              }
            });
            
            console.log(`[Job ${this.jobId}] Updated history ${this.historyId} as completed`);
          }
          
          this.stop();
          return;
        }

        const target = workQueue[0];
        
        this.stats.doneFlows++;
        target.remaining--;
        
        const proxy = this.config.loadedData.proxies.length > 0
          ? this.config.loadedData.proxies[Math.floor(Math.random() * this.config.loadedData.proxies.length)]
          : null;
        
        const platform = this.config.loadedData.platforms.length > 0
          ? this.config.loadedData.platforms[Math.floor(Math.random() * this.config.loadedData.platforms.length)]
          : null;

        this.emitLog('flow_ok', `OK: ${target.url} (Proxy: ${proxy ? proxy.host : 'None'}, Platform: ${platform ? platform.os : 'None'})`);
        
        this.emitToUser('flowDoneUpdate', {
          targetId: target.id,
          flowDone: (target.flowTarget - target.remaining)
        });
        
        if (target.remaining <= 0) {
          workQueue.shift();
        }

        // ** PERIODIC HISTORY UPDATE (every 10 flows) **
        if (this.historyId && this.stats.doneFlows % 10 === 0) {
          historyManager.updateHistory(this.historyId, {
            stats: {
              totalFlow: this.stats.totalFlows,
              flowDone: this.stats.doneFlows,
              impressions: this.stats.doneFlows,
              clicks: this.stats.doneClicks,
              failedFlow: this.stats.fail
            }
          });
        }

        if (workQueue.length === 0) {
          this.emitLog('info', 'All flows completed.');
          
          // ** UPDATE HISTORY AS COMPLETED **
          if (this.historyId) {
            const stopTime = new Date().toISOString();
            const duration = this.stats.startTime 
              ? Math.floor((Date.now() - this.stats.startTime) / 1000) 
              : 0;
            
            historyManager.updateHistory(this.historyId, {
              stopTime: stopTime,
              status: 'completed',
              duration: duration,
              stats: {
                totalFlow: this.stats.totalFlows,
                flowDone: this.stats.doneFlows,
                impressions: this.stats.doneFlows,
                clicks: this.stats.doneClicks,
                failedFlow: this.stats.fail
              }
            });
          }
          
          this.stop();
          return;
        }
      }
      
      this.emitStatus();

    }, intervalMs);
  }
  
  // ** UPDATED: Add history update on stop **
  stop() {
    if (this.status === 'stopped' || this.status === 'failed' || this.status === 'stopping') {
      return;
    }
    
    this.status = 'stopping';
    this.emitStatus();
    this.emitLog('info', 'Job stopping...');

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    setTimeout(() => {
      this.status = 'stopped';
      this.emitStatus();
      this.emitLog('info', 'Job stopped.');
      
      // ** UPDATE HISTORY ON STOP **
      if (this.historyId) {
        const stopTime = new Date().toISOString();
        const duration = this.stats.startTime 
          ? Math.floor((Date.now() - this.stats.startTime) / 1000) 
          : 0;
        
        historyManager.updateHistory(this.historyId, {
          stopTime: stopTime,
          status: 'stopped',
          duration: duration,
          stats: {
            totalFlow: this.stats.totalFlows,
            flowDone: this.stats.doneFlows,
            impressions: this.stats.doneFlows,
            clicks: this.stats.doneClicks,
            failedFlow: this.stats.fail
          }
        });
        
        console.log(`[Job ${this.jobId}] Updated history ${this.historyId} on stop`);
      }
      
      this.cleanup();
    }, 500); 
  }

  cleanup() {
    jobs.delete(this.jobId);
    const uJobs = userJobs.get(this.userId);
    if (uJobs) {
      uJobs.delete(this.jobId);
      if (uJobs.size === 0) {
        userJobs.delete(this.userId);
      }
    }
    this.removeAllListeners();
  }

  emitStatus() {
    this.emitToUser('jobStatusUpdate', this.getStatusPayload());
  }

  emitLog(level, message, meta = {}) {
    this.emitToUser('log', { level, message, ...meta, ts: new Date().toISOString() });
  }

  getStatusPayload() {
    return {
      jobId: this.jobId,
      status: this.status,
      stats: this.stats,
      historyId: this.historyId, // ** NEW **
      configSummary: {
        instanceCount: this.config?.instanceCount || 0,
        targets: this.datasetRefs.targetSet,
        proxies: this.datasetRefs.proxySet || 'None',
        platforms: this.datasetRefs.platformSet || 'None',
        settings: this.datasetRefs.settingsProfile,
      }
    };
  }
}

// ** UPDATED: Add race condition check & history creation **
async function createJob(user, matrix, datasetRefs) {
  const userId = user.username;
  
  // ** RACE CONDITION CHECK: Stop previous job **
  const existingJobs = listJobsForUser(userId);
  if (existingJobs.length > 0) {
    console.log(`[jobManager] User ${userId} has ${existingJobs.length} active job(s), stopping them first`);
    
    for (const existingJob of existingJobs) {
      const job = jobs.get(existingJob.jobId);
      if (job) {
        // Update history before stopping
        if (job.historyId) {
          const stopTime = new Date().toISOString();
          const duration = job.stats.startTime 
            ? Math.floor((Date.now() - job.stats.startTime) / 1000) 
            : 0;
          
          historyManager.updateHistory(job.historyId, {
            stopTime: stopTime,
            status: 'stopped',
            duration: duration,
            stats: {
              totalFlow: job.stats.totalFlows,
              flowDone: job.stats.doneFlows,
              impressions: job.stats.doneFlows,
              clicks: job.stats.doneClicks,
              failedFlow: job.stats.fail
            }
          });
          
          console.log(`[jobManager] Updated history ${job.historyId} before stopping`);
        }
        
        job.stop();
      }
    }
    
    // Wait 2 seconds before starting new job
    console.log('[jobManager] Waiting 2 seconds before starting new job...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  const userJobSet = userJobs.get(userId) || new Set();
  if (userJobSet.size >= MAX_CONCURRENT_JOBS_PER_USER) {
    throw new Error('JOB_LIMIT_REACHED');
  }

  const job = new Job(user, matrix, datasetRefs);
  await job.loadAsync();
  
  // ** CREATE HISTORY ENTRY **
  const historyId = `hist_${Date.now()}_${userId}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = new Date().toISOString();
  
  const historyEntry = {
    id: historyId,
    userId: userId,
    jobId: job.jobId,
    scheduleId: datasetRefs.scheduleId || null,
    startTime: startTime,
    stopTime: null,
    duration: 0,
    status: 'running',
    stats: {
      totalFlow: job.stats.totalFlows,
      flowDone: 0,
      impressions: 0,
      clicks: 0,
      failedFlow: 0
    },
    config: {
      targetSet: datasetRefs.targetSet,
      proxySet: datasetRefs.proxySet || null,
      platformSet: datasetRefs.platformSet || null,
      settingsProfile: datasetRefs.settingsProfile,
      instanceCount: job.config?.instanceCount || 1
    }
  };
  
  historyManager.addHistory(historyEntry);
  
  // Attach historyId to job
  job.historyId = historyId;
  
  console.log(`[jobManager] Created job ${job.jobId} with history ${historyId}`);

  jobs.set(job.jobId, job);
  userJobSet.add(job.jobId);
  userJobs.set(userId, userJobSet);

  job.startSimulator();

  return job.getStatusPayload();
}

function stopJob(userId, jobId) {
  const job = jobs.get(jobId);
  if (job && job.userId === userId && (job.status === 'running' || job.status === 'loading')) {
    job.stop();
    return true;
  }
  return false;
}

function stopAllJobsForUser(userId) {
  const jobIds = userJobs.get(userId) || new Set();
  let count = 0;
  for (const jobId of jobIds) {
    if (stopJob(userId, jobId)) {
      count++;
    }
  }
  return count;
}

function listJobsForUser(userId) {
  const jobIds = userJobs.get(userId) || new Set();
  return Array.from(jobIds).map(jobId => {
    const job = jobs.get(jobId);
    return job ? job.getStatusPayload() : null;
  }).filter(Boolean);
}

function getJobStatus(userId, jobId) {
  const job = jobs.get(jobId);
  if (job && job.userId === userId) {
    return job.getStatusPayload();
  }
  return null;
}

function getJobInstance(jobId) {
  return jobs.get(jobId) || null;
}

module.exports = {
  createJob,
  stopJob,
  stopAllJobsForUser,
  listJobsForUser,
  getJobStatus,
  getJobInstance 
};
