/**
 * BACKEND - lib/sessionCleaner.js
 * (PERBAIKAN KOMPREHENSIF v4)
 * - (FIX) Menghapus pembacaan 'process.env' dari file ini.
 * - (FIX) Fungsi 'start' sekarang menerima 'intervalMs' dan 'graceMs' sebagai parameter.
 */
'use strict';

const path = require('path');
const fs = require('fs').promises;
const userStore = require('./userStore');

let intervalId = null;

// (DIHAPUS) Pembacaan .env dipindahkan ke db.js

/**
 * (PERUBAHAN) Fungsi start sekarang menerima konfigurasi
 * @param {object} options
 * @param {number} options.intervalMs - Seberapa sering cleaner berjalan
 * @param {number} options.graceMs - Durasi grace period
 */
function start({ intervalMs, graceMs }) {
  
  console.log(`sessionCleaner started (interval=${intervalMs}ms, graceBuffer=${graceMs}ms)`);

  if (intervalId) {
    clearInterval(intervalId);
  }

  const clean = async () => {
    // console.log('[sessionCleaner] Menjalankan pembersihan sesi lama...');
    try {
      const now = Date.now();
      const userFiles = await fs.readdir(userStore.USERS_DIR);
      
      for (const userFile of userFiles) {
        if (!userFile.endsWith('.json')) continue;
        
        const userId = userFile.replace('.json', '');
        let user;
        try {
          user = await userStore.loadUser(userId);
        } catch (e) {
          console.warn(`[sessionCleaner] Gagal memuat ${userFile}: ${e.message}`);
          continue;
        }
        
        if (!user || !user.sessions || user.sessions.length === 0) {
          continue;
        }

        let sessionsChanged = false;
        const activeSessions = [];

        for (const session of user.sessions) {
          const lastSeenTime = new Date(session.lastSeen || session.createdAt).getTime();
          
          if ((now - lastSeenTime) > graceMs) { // (PERBAIKAN: gunakan graceMs)
            // Sesi kadaluarsa
            console.log(`[sessionCleaner] Sesi untuk ${userId} (ID: ${session.sessionId}) telah kadaluarsa (terakhir terlihat ${Math.round((now - lastSeenTime)/1000)}s lalu). Membersihkan...`);
            sessionsChanged = true;
          } else {
            // Sesi masih aktif
            activeSessions.push(session);
          }
        }

        if (sessionsChanged) {
          user.sessions = activeSessions;
          await userStore.saveUser(user);
        }
      }
      
    } catch (e) {
      if (e.code === 'ENOENT') {
         console.warn(`[sessionCleaner] Direktori 'users' belum ada, melewatkan clean.`);
      } else {
         console.error('[sessionCleaner] Error saat membersihkan sesi:', e.message);
      }
    }
  };

  clean();
  intervalId = setInterval(clean, intervalMs);
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('sessionCleaner stopped.');
  }
}

module.exports = { start, stop };
