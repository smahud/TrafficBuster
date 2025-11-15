/**
 * BACKEND - lib/audit.js
 * (PERBAIKAN: Menambahkan 'module.exports' yang hilang)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const userStore = require('./userStore'); // Diperlukan untuk base path

// Fungsi untuk memastikan direktori log ada
async function ensureLogDir(userId) {
  try {
    // Asumsi userStore.USERS_DIR sudah didefinisikan dan diekspor
    const logDir = path.join(userStore.USERS_DIR, userId, 'logs');
    await fs.promises.mkdir(logDir, { recursive: true });
    return logDir;
  } catch (e) {
    console.error(`[audit] Gagal membuat direktori log untuk ${userId}: ${e.message}`);
    return null;
  }
}

async function appendAudit(userId, event, metadata = {}) {
  if (!userId || !event) {
    return; 
  }

  const logDir = await ensureLogDir(userId);
  if (!logDir) {
    return; 
  }

  const timestamp = new Date().toISOString();
  const logEntry = {
    ts: timestamp,
    evt: event,
    meta: metadata
  };

  const logLine = JSON.stringify(logEntry) + '\n';
  
  // Menggunakan file log terpisah per user berdasarkan lisensi
  // Perlu memuat user untuk mendapatkan lisensi
  let license = 'free'; // default
  try {
    const user = await userStore.loadUser(userId);
    if (user && user.license) {
      license = user.license.toLowerCase();
    }
  } catch(e) {
    console.warn(`[audit] Gagal memuat user ${userId} untuk logging, menggunakan 'free'.`);
  }
  
  const logFilePath = path.join(logDir, `${license}.log`);

  try {
    await fs.promises.appendFile(logFilePath, logLine, 'utf8');
  } catch (e) {
    console.error(`[audit] Gagal menulis ke audit log ${userId}: ${e.message}`);
  }
}

// **** INI ADALAH PERBAIKANNYA ****
module.exports = { appendAudit, ensureLogDir };
