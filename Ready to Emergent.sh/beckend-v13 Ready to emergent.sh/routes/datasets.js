/**
 * BACKEND - routes/datasets.js (UPDATED - TODOLIST 15)
 * Dataset upload dengan validasi lisensi lengkap (Tugas 51-54)
 * Credit: smahud - 2025-11-13 12:27:36 UTC
 * 
 * UPDATES (TODOLIST 15):
 * - Added proxy test endpoint (POST /proxy/test)
 * - Added settings deep validation (instance count + human surfing)
 * - Added health check endpoint (GET /health)
 * - Added user config endpoints (GET/POST /user/config)
 */

'use strict';

const express = require('express');
const {
  startUpload,
  appendChunk,
  finalizeUpload,
  listDatasets,
  getDataset,
  deleteDataset
} = require('../lib/datasetStore');

const userStore = require('../lib/userStore');
const { deriveFeatureMatrix, publicizeMatrix } = require('../lib/licenseMatrix');
const { appendAudit } = require('../lib/audit');
const { testProxy } = require('../lib/proxyTester'); // NEW

function makeDatasetsRouter(deps) {
  const router = express.Router();
  const { authenticateJWT } = deps;

  // ========================================================================
  // HEALTH CHECK ENDPOINT (NEW - TODOLIST 15)
  // ========================================================================
  
  /**
   * GET /api/v1/data/health
   * Simple health check for monitoring
   */
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      status: 'healthy',
      service: 'datasets',
      version: '10.0.0',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime())
    });
  });

  // ========================================================================
  // PROXY TEST ENDPOINT (NEW - TODOLIST 15)
  // ========================================================================
  
  /**
   * POST /api/v1/data/proxy/test
   * Test proxy connectivity from backend
   * 
   * Request body:
   * {
   *   "host": "104.248.63.15",
   *   "port": 30588,
   *   "username": "user",      // optional
   *   "password": "pass",      // optional
   *   "testUrl": "https://...", // optional
   *   "timeout": 5000          // optional
   * }
   * 
   * Response (success):
   * {
   *   "success": true,
   *   "sessionActive": true,
   *   "speed": 450,
   *   "protocol": "HTTP",
   *   "country": "US"
   * }
   * 
   * Response (failed):
   * {
   *   "success": false,
   *   "sessionActive": true,
   *   "error": "Connection timeout"
   * }
   */
  router.post('/proxy/test', authenticateJWT, async (req, res) => {
    try {
      const { userId } = req.user;
      const { host, port, username, password, testUrl, timeout } = req.body || {};
      
      // Validation
      if (!host || !port) {
        return res.status(400).json({
          success: false,
          sessionActive: true,
          code: 'VALIDATION_ERROR',
          message: 'host and port are required'
        });
      }
      
      // Load user matrix untuk validasi license
      const user = await userStore.loadUser(userId);
      const matrix = deriveFeatureMatrix(user);
      
      // Check if proxies allowed for this license
      if (!matrix.allowProxies) {
        return res.status(403).json({
          success: false,
          sessionActive: true,
          code: 'LICENSE_FEATURE_DISABLED',
          message: 'Proxy testing not allowed for your license tier',
          meta: { 
            feature: 'allowProxies', 
            license: matrix.license 
          }
        });
      }
      
      // Log audit
      await appendAudit(userId, 'proxy_test', { host, port });
      
      // Test proxy
      const result = await testProxy(
        { host, port, username, password },
        testUrl || 'https://www.google.com/generate_204',
        timeout || 5000
      );
      
      // Return result
      res.json({
        success: result.success,
        sessionActive: true,
        speed: result.speed,
        protocol: result.protocol,
        country: result.country,
        error: result.error
      });
      
    } catch (e) {
      console.error('[routes/datasets] proxy/test error:', e);
      res.status(500).json({
        success: false,
        sessionActive: true,
        message: 'Server error during proxy test',
        error: e.message
      });
    }
  });

  // ========================================================================
  // USER CONFIG ENDPOINTS (NEW - TODOLIST 15)
  // ========================================================================
  
  /**
   * GET /api/v1/data/user/config
   * Get user's last saved configuration
   * 
   * Response:
   * {
   *   "success": true,
   *   "sessionActive": true,
   *   "config": { ... },
   *   "lastSaved": "2025-11-13T12:00:00Z"
   * }
   */
  router.get('/user/config', authenticateJWT, async (req, res) => {
    try {
      const { userId } = req.user;
      
      const user = await userStore.loadUser(userId);
      
      if (!user || !user.config || Object.keys(user.config).length === 0) {
        return res.json({
          success: true,
          sessionActive: true,
          config: null,
          message: 'No saved config found'
        });
      }
      
      res.json({
        success: true,
        sessionActive: true,
        config: user.config,
        lastSaved: user.config.lastSaved || new Date().toISOString()
      });
      
    } catch (e) {
      console.error('[routes/datasets] user/config GET error:', e);
      res.status(500).json({
        success: false,
        sessionActive: true,
        message: 'Server error loading config'
      });
    }
  });
  
  /**
   * POST /api/v1/data/user/config
   * Save user's configuration
   * 
   * Request body:
   * {
   *   "config": {
   *     "generalTargets": [...],
   *     "geoProxies": [...],
   *     "platforms": [...],
   *     "settings": {...}
   *   }
   * }
   * 
   * Response:
   * {
   *   "success": true,
   *   "sessionActive": true,
   *   "message": "Config saved",
   *   "lastSaved": "2025-11-13T12:00:00Z"
   * }
   */
  router.post('/user/config', authenticateJWT, async (req, res) => {
    try {
      const { userId } = req.user;
      const { config } = req.body || {};
      
      if (!config || typeof config !== 'object') {
        return res.status(400).json({
          success: false,
          sessionActive: true,
          message: 'config object required'
        });
      }
      
      const user = await userStore.loadUser(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          sessionActive: true,
          message: 'User not found'
        });
      }
      
      // Save config with timestamp
      user.config = {
        ...config,
        lastSaved: new Date().toISOString()
      };
      
      await userStore.saveUser(user);
      await appendAudit(userId, 'config_save', {});
      
      res.json({
        success: true,
        sessionActive: true,
        message: 'Config saved',
        lastSaved: user.config.lastSaved
      });
      
    } catch (e) {
      console.error('[routes/datasets] user/config POST error:', e);
      res.status(500).json({
        success: false,
        sessionActive: true,
        message: 'Server error saving config'
      });
    }
  });

  // ========================================================================
  // DATASET UPLOAD ENDPOINTS (EXISTING - Tugas 51-54)
  // ========================================================================

  // POST /upload/start
  router.post('/upload/start', authenticateJWT, async (req, res) => {
    try {
      const { userId } = req.user;
      const { datasetType, setName, mode, expectChunks, totalItems } = req.body || {};
      const meta = await startUpload(userId, { datasetType, setName, mode, expectChunks, totalItems });
      await appendAudit(userId, 'upload_start', {
        datasetType: meta.datasetType,
        setName: meta.setName,
        mode: meta.mode,
        expectChunks: meta.expectChunks
      });
      res.json({ success: true, sessionActive: true, uploadId: meta.uploadId, expectChunks: meta.expectChunks });
    } catch (e) {
      const msg = e.message || 'error';
      if (msg.startsWith('VALIDATION_ERROR')) {
        return res.status(400).json({ success: false, sessionActive: true, code: 'VALIDATION_ERROR', message: msg });
      }
      res.status(400).json({ success: false, sessionActive: true, code: msg, message: msg });
    }
  });

  // POST /upload/chunk
  router.post('/upload/chunk', authenticateJWT, async (req, res) => {
    try {
      const { userId } = req.user;
      const { uploadId, chunkIndex, items } = req.body || {};
      const info = await appendChunk(userId, uploadId, chunkIndex, items);
      await appendAudit(userId, 'upload_chunk', { uploadId, chunkIndex: info.chunkIndex, count: info.count });
      res.json({ success: true, sessionActive: true, chunkIndex: info.chunkIndex, count: info.count, receivedChunks: info.receivedChunks, expectChunks: info.expectChunks });
    } catch (e) {
      const msg = e.message || 'error';
      if (msg === 'UPLOAD_SESSION_NOT_FOUND') {
        return res.status(404).json({ success: false, sessionActive: true, code: msg, message: 'Upload session not found' });
      }
      if (msg.startsWith('UPLOAD_INVALID_CHUNK')) {
        return res.status(400).json({ success: false, sessionActive: true, code: 'UPLOAD_INVALID_CHUNK', message: msg });
      }
      if (msg.startsWith('VALIDATION_ERROR')) {
        return res.status(400).json({ success: false, sessionActive: true, code: 'VALIDATION_ERROR', message: msg });
      }
      res.status(400).json({ success: false, sessionActive: true, code: msg, message: msg });
    }
  });

  // POST /upload/finish (UPDATED - TODOLIST 15: Deep validation for settings)
  router.post('/upload/finish', authenticateJWT, async (req, res) => {
    try {
      const { userId } = req.user;
      const { uploadId } = req.body || {};

      const user = await userStore.loadUser(userId);
      const matrix = deriveFeatureMatrix(user);

      const result = await finalizeUpload(userId, uploadId);

      // Validasi TARGETS (existing)
      if (result.datasetType === 'targets') {
        if (result.items > matrix.maxTargets) {
          return res.status(400).json({
            success: false,
            sessionActive: true,
            code: 'LIMIT_MAX_TARGETS',
            message: `Targets count ${result.items} exceeds maxTargets ${matrix.maxTargets}`,
            meta: { requested: result.items, limit: matrix.maxTargets }
          });
        }
      }

      // TUGAS 51: Validasi PROXIES (existing)
      if (result.datasetType === 'proxies') {
        if (result.items > matrix.maxProxies) {
          return res.status(400).json({
            success: false,
            sessionActive: true,
            code: 'LIMIT_MAX_PROXIES',
            message: `Proxies count ${result.items} exceeds maxProxies ${matrix.maxProxies}`,
            meta: { requested: result.items, limit: matrix.maxProxies }
          });
        }
      }

      // TUGAS 52: Validasi PLATFORMS (existing)
      if (result.datasetType === 'platforms') {
        if (!matrix.allowPlatformCustom) {
          return res.status(400).json({
            success: false,
            sessionActive: true,
            code: 'LICENSE_FEATURE_DISABLED',
            message: 'Platform customization is not allowed for your license tier',
            meta: { feature: 'allowPlatformCustom', license: matrix.license }
          });
        }
      }

      // TUGAS 53: Validasi SETTINGS (EXTENDED - TODOLIST 15)
      if (result.datasetType === 'settings') {
        // 1. Check allowSettingsAdvanced (existing)
        if (!matrix.allowSettingsAdvanced) {
          return res.status(400).json({
            success: false,
            sessionActive: true,
            code: 'LICENSE_FEATURE_DISABLED',
            message: 'Advanced settings are not allowed for your license tier',
            meta: { feature: 'allowSettingsAdvanced', license: matrix.license }
          });
        }
        
        // 2. DEEP VALIDATION (NEW - Boss's correction)
        const settingsData = await getDataset(userId, 'settings', result.setName);
        if (settingsData && settingsData.length > 0) {
          const settings = settingsData[0]; // Settings always has 1 item
          
          // 2a. Instance Count Validation
          const instanceCount = settings.instanceCount || 1;
          if (instanceCount > matrix.maxInstances) {
            return res.status(400).json({
              success: false,
              sessionActive: true,
              code: 'LIMIT_MAX_INSTANCES',
              message: `Instance count ${instanceCount} exceeds maxInstances ${matrix.maxInstances}`,
              meta: { 
                requested: instanceCount, 
                limit: matrix.maxInstances,
                license: matrix.license 
              }
            });
          }
          
          // 2b. Human Surfing Validation (Free license)
          if (!matrix.allowHumanSurfing) {
            const hs = settings.humanSurfing || {};
            
            const hasHumanSurfing = 
              hs.autoPageScrolling || 
              hs.autoClickRatio ||
              (hs.internalClick && hs.internalClick.enabled) ||
              (hs.externalClick && hs.externalClick.enabled);
            
            if (hasHumanSurfing) {
              return res.status(400).json({
                success: false,
                sessionActive: true,
                code: 'LICENSE_FEATURE_DISABLED',
                message: `Human Surfing not allowed for '${matrix.license}' license`,
                meta: { 
                  feature: 'allowHumanSurfing',
                  license: matrix.license,
                  violatedFields: {
                    autoPageScrolling: hs.autoPageScrolling || false,
                    autoClickRatio: hs.autoClickRatio || false,
                    internalClick: (hs.internalClick && hs.internalClick.enabled) || false,
                    externalClick: (hs.externalClick && hs.externalClick.enabled) || false
                  }
                }
              });
            }
          }
        }
      }

      await appendAudit(userId, 'upload_finish', { uploadId, datasetType: result.datasetType, setName: result.setName, items: result.items });

      res.json({
        success: true,
        sessionActive: true,
        dataset: {
          type: result.datasetType,
          setName: result.setName,
          items: result.items
        },
        features: publicizeMatrix(matrix)
      });
    } catch (e) {
      const msg = e.message || 'error';
      if (msg === 'UPLOAD_SESSION_NOT_FOUND') {
        return res.status(404).json({ success: false, sessionActive: true, code: msg, message: 'Upload session not found' });
      }
      if (msg.startsWith('UPLOAD_INVALID_CHUNK')) {
        return res.status(400).json({ success: false, sessionActive: true, code: 'UPLOAD_INVALID_CHUNK', message: msg });
      }
      if (msg.startsWith('VALIDATION_ERROR')) {
        return res.status(400).json({ success: false, sessionActive: true, code: 'VALIDATION_ERROR', message: msg });
      }
      res.status(400).json({ success: false, sessionActive: true, code: msg, message: msg });
    }
  });

  // GET /list?type=targets
  router.get('/list', authenticateJWT, async (req, res) => {
    try {
      const { userId } = req.user;
      const datasetType = req.query.type;
      const sets = await listDatasets(userId, datasetType);
      res.json({ success: true, sessionActive: true, datasetType, sets });
    } catch (e) {
      const msg = e.message || 'error';
      if (msg.startsWith('VALIDATION_ERROR')) {
        return res.status(400).json({ success: false, sessionActive: true, code: 'VALIDATION_ERROR', message: msg });
      }
      res.status(400).json({ success: false, sessionActive: true, code: msg, message: msg });
    }
  });

  // GET /get?type=targets&set=default
  router.get('/get', authenticateJWT, async (req, res) => {
    try {
      const { userId } = req.user;
      const datasetType = req.query.type;
      const setName = req.query.set;
      const data = await getDataset(userId, datasetType, setName);
      res.json({ success: true, sessionActive: true, datasetType, setName, items: data.length, data });
    } catch (e) {
      const msg = e.message || 'error';
      if (msg === 'DATASET_NOT_FOUND') {
        return res.status(404).json({ success: false, sessionActive: true, code: msg, message: 'Dataset not found' });
      }
      if (msg.startsWith('VALIDATION_ERROR')) {
        return res.status(400).json({ success: false, sessionActive: true, code: 'VALIDATION_ERROR', message: msg });
      }
      res.status(400).json({ success: false, sessionActive: true, code: msg, message: msg });
    }
  });

  // DELETE /delete
  router.delete('/delete', authenticateJWT, async (req, res) => {
    try {
      const { userId } = req.user;
      const { datasetType, setName } = req.body || {};
      const ok = await deleteDataset(userId, datasetType, setName);
      if (ok) {
        await appendAudit(userId, 'dataset_delete', { datasetType, setName });
        return res.json({ success: true, sessionActive: true, message: 'Deleted' });
      }
      res.status(404).json({ success: false, sessionActive: true, code: 'DATASET_NOT_FOUND', message: 'Dataset not found' });
    } catch (e) {
      const msg = e.message || 'error';
      if (msg === 'DATASET_NOT_FOUND') {
        return res.status(404).json({ success: false, sessionActive: true, code: msg, message: 'Dataset not found' });
      }
      if (msg.startsWith('VALIDATION_ERROR')) {
        return res.status(400).json({ success: false, sessionActive: true, code: 'VALIDATION_ERROR', message: msg });
      }
      res.status(400).json({ success: false, sessionActive: true, code: msg, message: msg });
    }
  });

  return router;
}

module.exports = makeDatasetsRouter;
