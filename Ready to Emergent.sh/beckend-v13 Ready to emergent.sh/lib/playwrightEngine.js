/**
 * BACKEND - lib/playwrightEngine.js (Implementasi V1)
 * (Pelaksanaan Tugas 57, 58, 61, 64)
 *
 * FITUR:
 * - Hybrid Mode: Otomatis menggunakan Playwright Connect (remote)
 * jika 'playwrightConnectUrl' ada di config.
 * - Fallback: Kembali ke mode headless lokal jika tidak ada URL remote.
 * - Worker Pool: Mengelola 'instanceCount' untuk menjalankan flow secara paralel.
 */

'use strict';

// Pastikan Anda sudah menjalankan: npm install playwright
const { chromium } = require('playwright');
const { executeFlow } = require('./flowWorker');

let browserInstance = null;
let currentBrowserType = null; // 'local' or 'remote'

/**
 * Mendapatkan instance browser.
 * Akan membuat instance baru (lokal atau remote) jika belum ada.
 * @param {object} job - Instance Job
 */
async function getBrowser(job) {
  const { config } = job;
  const connectUrl = config.playwrightConnectUrl; // Misal: "ws://192.168.1.10:9323"

  if (browserInstance) {
    // Jika tipe browser yang diminta sama, gunakan yang sudah ada
    if ((connectUrl && currentBrowserType === 'remote') || (!connectUrl && currentBrowserType === 'local')) {
      return browserInstance;
    }
    // Jika tipe berubah (misal dari lokal ke remote), tutup yang lama
    job.emitLog('info', 'Tipe koneksi browser berubah. Menutup instance lama...');
    await stopBrowser();
  }

  if (connectUrl) {
    // --- SKENARIO 2: Mode Remote (Headful di PC Lain) ---
    currentBrowserType = 'remote';
    job.emitLog('info', `Menghubungkan ke server browser remote di: ${connectUrl}`);
    try {
      browserInstance = await chromium.connect(connectUrl);
      browserInstance.on('disconnected', () => {
        console.warn('[PlaywrightEngine] Koneksi ke server browser remote terputus.');
        browserInstance = null;
        currentBrowserType = null;
      });
      return browserInstance;
    } catch (e) {
      console.error(`[PlaywrightEngine] FATAL: Gagal terhubung ke Playwright Server di ${connectUrl}`, e);
      throw new Error(`Gagal terhubung ke Playwright Server: ${e.message}`);
    }
  } else {
    // --- SKENARIO 1: Mode Lokal (Headless di Server Debian) ---
    currentBrowserType = 'local';
    job.emitLog('info', 'Meluncurkan instance browser (headless) lokal...');
    try {
      browserInstance = await chromium.launch({
        headless: true, // Produksi standar
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Wajib untuk Linux
      });
      browserInstance.on('disconnected', () => {
        console.warn('[PlaywrightEngine] Browser lokal (headless) terputus.');
        browserInstance = null;
        currentBrowserType = null;
      });
      return browserInstance;
    } catch (e) {
      console.error('[PlaywrightEngine] FATAL: Gagal meluncurkan Playwright Chromium', e);
      throw new Error(`Gagal meluncurkan Playwright: ${e.message}`);
    }
  }
}

/**
 * Menutup koneksi browser (jika ada)
 */
async function stopBrowser() {
  if (browserInstance) {
    console.log(`[PlaywrightEngine] Menutup koneksi browser (${currentBrowserType})...`);
    try {
      await browserInstance.close();
    } catch (e) {
      console.warn(`[PlaywrightEngine] Error saat menutup browser: ${e.message}`);
    }
    browserInstance = null;
    currentBrowserType = null;
  }
}

/**
 * Memulai eksekusi job menggunakan Playwright.
 * @param {object} job - Instance Job dari jobManager.
 */
async function startJob(job) {
  const { config, matrix, stats } = job;
  let browser;

  try {
    browser = await getBrowser(job);
  } catch (e) {
    job.emitLog('error', e.message);
    job.status = 'failed';
    job.emitStatus();
    job.cleanup();
    return;
  }
  
  // Tentukan jumlah instance
  const maxAllowed = matrix.maxInstances || 1;
  const requested = config.instanceCount || 1;
  const instanceCount = Math.min(maxAllowed, requested);
  
  if (requested > maxAllowed) {
     job.emitLog('warn', `Instance count diturunkan ke ${instanceCount} (batas lisensi: ${maxAllowed})`);
  }

  job.emitLog('info', `Menjalankan dengan ${instanceCount} instance paralel.`);

  // Buat antrian kerja
  const workQueue = config.loadedData.targets
    .filter(t => t.flowTarget > 0)
    .flatMap(t => Array(t.flowTarget || 0).fill(t)); // Ulangi target sebanyak flowTarget

  stats.totalFlows = workQueue.length;
  job.emitStatus();

  if (workQueue.length === 0) {
    job.emitLog('warn', 'Tidak ada flow untuk dijalankan (totalFlows = 0).');
    job.stop();
    return;
  }

  // Fungsi worker untuk pool
  const worker = async () => {
    while (workQueue.length > 0) {
      if (job.status !== 'running') break; // Berhenti jika job dihentikan

      const target = workQueue.pop(); // Ambil 1 pekerjaan
      if (!target) break;

      try {
        const result = await executeFlow(browser, job, target); 
        
        // Update statistik
        stats.doneFlows++;
        stats.success++;
        
        // (Tugas 33) Kirim update flowDone
        job.emitToUser('flowDoneUpdate', {
          targetId: result.targetId,
          flowDone: result.newFlowDone,
        });
        
        job.emitLog('flow_ok', `OK: ${target.url} (Durasi: ${result.durationMs}ms)`);

      } catch (flowError) {
        stats.doneFlows++;
        stats.fail++;
        job.emitLog('flow_fail', `FAIL: ${target.url} (Error: ${flowError.message})`);
      }
      
      job.emitStatus(); // Update progress bar
    }
  };

  // Jalankan pool
  const workers = [];
  for (let i = 0; i < instanceCount; i++) {
    workers.push(worker());
  }

  // Tunggu semua selesai
  await Promise.all(workers);

  if (job.status === 'running') {
    job.emitLog('info', 'Semua flow Playwright selesai.');
    job.stop();
  }
}

module.exports = {
  startJob,
  stopBrowser
};
