/**
 * BACKEND - lib/scheduler.js (BARU - Versi File-Based)
 * (Prioritas 2: Implementasi Scheduler)
 *
 * Mengelola cron job DAN penyimpanan file JSON untuk job terjadwal.
 * - Menyimpan job di: users/<userId>/scheduler/<jobId>.json
 * - Menjaga isolasi data pengguna.
 */
'use strict';

const cron = require('node-cron');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const userStore = require('./userStore');
const { deriveFeatureMatrix } = require('./licenseMatrix');
const jobManager = require('./jobManager');
const { sendToUser } = require('../websocket');

let cronTask = null;

// === 1. Fungsi Helper Penyimpanan (File I/O) ===

/**
 * Mendapatkan path direktori scheduler untuk user.
 */
function userScheduleDir(userId) {
  // Menggunakan userStore.USERS_DIR untuk path yang konsisten
  return path.join(userStore.USERS_DIR, userId, 'scheduler');
}

/**
 * Mendapatkan path file untuk jobId spesifik.
 */
function jobFilePath(userId, jobId) {
  return path.join(userScheduleDir(userId), `${jobId}.json`);
}

/**
 * Penulisan file atomik (mencegah korupsi data).
 */
async function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp.${crypto.randomBytes(6).toString('hex')}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8' });
  await fs.rename(tmp, filePath);
}

/**
 * Memuat SEMUA job terjadwal dari SEMUA user.
 * Ini digunakan oleh 'tick' cron untuk menemukan pekerjaan.
 */
async function loadAllScheduledJobs() {
  const allJobs = [];
  let userDirs = [];

  try {
    // Membaca direktori 'users'
    userDirs = await fs.readdir(userStore.USERS_DIR, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return []; // Folder 'users' belum ada
    throw e;
  }

  for (const userDir of userDirs) {
    if (!userDir.isDirectory()) continue;
    
    const userId = userDir.name;
    const schedDir = userScheduleDir(userId);
    let jobFiles = [];

    try {
      jobFiles = await fs.readdir(schedDir);
    } catch (e) {
      if (e.code === 'ENOENT') continue; // User ini tidak punya folder scheduler
      console.warn(`[Scheduler] Gagal membaca dir scheduler untuk ${userId}: ${e.message}`);
      continue;
    }

    for (const jobFile of jobFiles) {
      if (!jobFile.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(schedDir, jobFile), 'utf8');
        const jobData = JSON.parse(raw);
        // Tambahkan userId agar 'tick' tahu siapa pemiliknya
        jobData._userId = userId; 
        allJobs.push(jobData);
      } catch (e) {
        console.warn(`[Scheduler] Gagal memuat file job ${jobFile} untuk ${userId}: ${e.message}`);
      }
    }
  }
  return allJobs;
}

// === 2. Fungsi Logika Cron ===

/**
 * Mengonversi 'occurrence' (dari frontend) ke pola cron.
 */
function getCronPattern(occurrence, startAtISO) {
  const date = new Date(startAtISO);
  if (isNaN(date.getTime())) throw new Error('Format tanggal startAt tidak valid');

  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // Cron adalah 1-12
  const dayOfWeek = date.getDay(); // Cron adalah 0-6 (Minggu=0)

  switch (occurrence) {
    case 'Once':
      // Jalankan sekali pada tanggal dan waktu spesifik
      return `${minute} ${hour} ${dayOfMonth} ${month} *`;
    case 'Daily':
      // Jalankan setiap hari pada jam dan menit tersebut
      return `${minute} ${hour} * * *`;
    case 'Weekly':
      // Jalankan setiap minggu pada hari, jam, dan menit tersebut
      return `${minute} ${hour} * * ${dayOfWeek}`;
    default:
      // Fallback untuk 'Every 6hrs', 'Every 12hrs', dll. (disederhanakan)
       console.warn(`[Scheduler] Occurrence '${occurrence}' belum didukung penuh, diatur ke 'Daily'.`);
      return `${minute} ${hour} * * *`;
  }
}

/**
 * Fungsi utama yang dijalankan cron setiap menit.
 */
async function tick() {
  // console.log('[Scheduler] Tick! Memeriksa job terjadwal...');
  const now = new Date();
  const allJobs = await loadAllScheduledJobs();

  for (const job of allJobs) {
    if (job.status !== 'scheduled') continue;

    const nextRunTime = new Date(job.nextRun);
    if (now >= nextRunTime) {
      const userId = job._userId;
      console.log(`[Scheduler] SAATNYA EKSEKUSI: Job '${job.name}' (ID: ${job.id}) untuk user ${userId}`);

      let jobFileUpdated = false;

      // Update status job di file JSON
      try {
        if (job.occurrence === 'Once') {
          job.status = 'running'; // Akan diubah ke 'completed'
          jobFileUpdated = true;
        }
        if (job.occurrence === 'Daily') {
           const tomorrow = new Date(nextRunTime.getTime());
           tomorrow.setDate(tomorrow.getDate() + 1);
           job.nextRun = tomorrow.toISOString();
           jobFileUpdated = true;
        }
        // (Tambahkan logika 'Weekly' di sini jika perlu)

        if (jobFileUpdated) {
          const { _userId, ...jobToSave } = job; // Hapus _userId internal
          await atomicWrite(jobFilePath(userId, job.id), jobToSave);
        }

      } catch (e) {
         console.error(`[Scheduler] Gagal update file job ${job.id} untuk ${userId}:`, e.message);
         continue; // Coba lagi menit depan
      }

      // Eksekusi job
      try {
        const user = await userStore.loadUser(userId);
        const matrix = deriveFeatureMatrix(user);
        
        await jobManager.createJob(user, matrix, job.jobPayload, (type, payload) => {
           sendToUser(userId, { type, ...payload });
        });
        
        sendToUser(userId, { 
          type: 'log', 
          level: 'info', 
          message: `Scheduler: Job '${job.name}' berhasil dimulai.` 
        });

        // Jika 'Once', ubah status akhir ke 'completed'
        if (job.occurrence === 'Once') {
          job.status = 'completed';
          const { _userId, ...jobToSave } = job;
          await atomicWrite(jobFilePath(userId, job.id), jobToSave);
        }

      } catch (e) {
        console.error(`[Scheduler] Gagal eksekusi job ${job.id} untuk ${userId}:`, e.message);
        sendToUser(userId, { 
          type: 'log', 
          level: 'error', 
          message: `Scheduler: Gagal memulai job '${job.name}': ${e.message}` 
        });
        
        // Kembalikan status ke 'scheduled' agar dicoba lagi
        try {
          job.status = 'scheduled';
          const { _userId, ...jobToSave } = job;
          await atomicWrite(jobFilePath(userId, job.id), jobToSave);
        } catch (saveError) {
           console.error(`[Scheduler] Gagal me-rollback status job ${job.id}:`, saveError.message);
        }
      }
    }
  }
}

/**
 * Inisialisasi dan memulai cron job.
 */
function initializeScheduler() {
  if (cronTask) {
    cronTask.stop();
  }
  // Jalankan 'tick' setiap menit
  cronTask = cron.schedule('* * * * *', tick, {
    scheduled: true,
    timezone: "UTC" // Standarisasi di UTC
  });
  console.log('[Scheduler] Cron job diinisialisasi (berjalan setiap menit).');
}

/**
 * Menambahkan job baru ke file JSON user.
 */
async function createScheduledJob(userId, scheduleConfig, jobPayload) {
  const { name, occurrence, startAt } = scheduleConfig;
  
  if (!name || !occurrence || !startAt) {
    throw new Error('Validasi Gagal: name, occurrence, dan startAt wajib diisi.');
  }

  const cronPattern = getCronPattern(occurrence, startAt);
  
  const job = {
    id: 'sched_' + crypto.randomBytes(8).toString('hex'),
    name,
    cronPattern,
    occurrence,
    nextRun: new Date(startAt).toISOString(),
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    jobPayload // Ini adalah payload { targetSet, proxySet, ... }
  };

  const dir = userScheduleDir(userId);
  await fs.mkdir(dir, { recursive: true });
  const fPath = jobFilePath(userId, job.id);
  await atomicWrite(fPath, job);
  
  console.log(`[Scheduler] Job baru disimpan untuk ${userId}: '${name}' (ID: ${job.id})`);
  return job;
}

/**
 * Mengambil daftar job terjadwal untuk seorang user.
 */
async function listScheduledJobs(userId) {
  const schedDir = userScheduleDir(userId);
  let jobFiles = [];

  try {
    jobFiles = await fs.readdir(schedDir);
  } catch (e) {
    if (e.code === 'ENOENT') return []; // Folder belum ada = tidak ada job
    throw e;
  }

  const jobs = [];
  for (const jobFile of jobFiles) {
    if (!jobFile.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(schedDir, jobFile), 'utf8');
      jobs.push(JSON.parse(raw));
    } catch (e) {
       console.warn(`[Scheduler] Gagal memuat file job ${jobFile} untuk ${userId}: ${e.message}`);
    }
  }
  // Urutkan berdasarkan yang terbaru dulu
  return jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Menghapus job terjadwal dari file system.
 */
async function deleteScheduledJob(userId, jobId) {
  if (!jobId || !jobId.startsWith('sched_')) {
    throw new Error('Format Job ID tidak valid');
  }
  
  const fPath = jobFilePath(userId, jobId);
  try {
    await fs.unlink(fPath); // Hapus file
    console.log(`[Scheduler] Job ${jobId} dihapus untuk ${userId}.`);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error('Job tidak ditemukan');
    }
    throw e; // Lemparkan error lain
  }
}

module.exports = {
  initializeScheduler,
  createScheduledJob,
  listScheduledJobs,
  deleteScheduledJob
};
