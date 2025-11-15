/**
 * BACKEND - lib/userStore.js
 * (MODIFIKASI: Menambahkan Tugas "Clean Start")
 * - (BARU) Menambahkan fungsi 'clearAllSessionsOnStartup'
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BASE_DIR = path.join(__dirname, '..');
const USERS_DIR = path.join(BASE_DIR, 'users');
const TEMP_SUFFIX = '.tmp';

const userCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; 

function sanitizeUsername(username) {
  if (!username) return '';
  return String(username).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 80);
}

async function ensureUsersDir() {
  try {
    await fs.mkdir(USERS_DIR, { recursive: true });
  } catch (e) {
    // ignore
  }
}

function userFilePath(sanitized) {
  return path.join(USERS_DIR, `${sanitized}.json`);
}

async function atomicWrite(filePath, data) {
  const tmp = `${filePath}${TEMP_SUFFIX}.${crypto.randomBytes(6).toString('hex')}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8' });
  await fs.rename(tmp, filePath);
}

async function loadUser(username) {
  await ensureUsersDir();
  const sanitized = sanitizeUsername(username);

  if (userCache.has(sanitized)) {
    try {
      const cachedData = userCache.get(sanitized);
      return JSON.parse(cachedData.data);
    } catch (e) {
      // Data cache korup, lanjutkan membaca dari disk
    }
  }

  const fp = userFilePath(sanitized);
  try {
    const raw = await fs.readFile(fp, 'utf8');
    userCache.set(sanitized, {
      data: raw,
      ts: Date.now()
    });
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function saveUser(userObj) {
  await ensureUsersDir();
  const sanitized = sanitizeUsername(userObj.username || userObj.user || userObj.userId || '');
  if (!sanitized) throw new Error('Invalid username for saveUser');
  const fp = userFilePath(sanitized);

  await atomicWrite(fp, userObj);

  userCache.set(sanitized, {
    data: JSON.stringify(userObj),
    ts: Date.now()
  });
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of userCache.entries()) {
    if (now - value.ts > CACHE_TTL_MS) {
      userCache.delete(key);
    }
  }
}, CACHE_TTL_MS);


async function ensureUserExists(username, email = null, license = 'Free') {
  const sanitized = sanitizeUsername(username);
  let user = await loadUser(sanitized);
  if (!user) {
    user = {
      username: sanitized,
      email: email || `${sanitized}@example.com`,
      license: license || 'Free',
      passwordHash: null,
      sessions: [],
      config: {}
    };
    await saveUser(user);
  }
  return user;
}

async function setPassword(username, plainPassword) {
  const sanitized = sanitizeUsername(username);
  let user = await ensureUserExists(sanitized);
  const hash = await bcrypt.hash(plainPassword, 10);
  user.passwordHash = hash;
  await saveUser(user);
  return true;
}

async function verifyPassword(username, plainPassword) {
  const sanitized = sanitizeUsername(username);
  const user = await loadUser(sanitized);
  if (!user || !user.passwordHash) return false;
  return bcrypt.compare(plainPassword, user.passwordHash);
}

function nowISO() {
  return new Date().toISOString();
}

function makeSessionId() {
  return 'sess_' + crypto.randomBytes(12).toString('hex');
}

async function createSession(username, clientInfo = {}) {
  const sanitized = sanitizeUsername(username);
  const user = await loadUser(sanitized);
  if (!user) throw new Error('User not found');
  const sessionId = makeSessionId();
  const session = {
    sessionId,
    createdAt: nowISO(),
    lastSeen: nowISO(),
    client: clientInfo || {},
    status: 'active'
  };
  user.sessions = user.sessions || [];
  user.sessions.push(session);
  await saveUser(user); 
  return session;
}

async function getSession(username, sessionId) {
  const sanitized = sanitizeUsername(username);
  const user = await loadUser(sanitized); 
  if (!user || !user.sessions) return null;
  return user.sessions.find(s => s.sessionId === sessionId) || null;
}

async function updateSessionLastSeen(username, sessionId) {
  const sanitized = sanitizeUsername(username);
  const user = await loadUser(sanitized);
  if (!user || !user.sessions) return null;
  const s = user.sessions.find(x => x.sessionId === sessionId);
  if (!s) return null;
  s.lastSeen = nowISO();
  s.status = 'active';
  await saveUser(user);
  return s;
}

async function invalidateSession(username, sessionId) {
  const sanitized = sanitizeUsername(username);
  const user = await loadUser(sanitized);
  if (!user || !user.sessions) return false;
  user.sessions = user.sessions.filter(s => s.sessionId !== sessionId);
  await saveUser(user);
  
  userCache.delete(sanitized);
  
  return true;
}

/**
 * (Tugas 62): Menghapus semua sesi untuk user.
 */
async function invalidateAllSessions(username) {
  const sanitized = sanitizeUsername(username);
  const user = await loadUser(sanitized);
  if (!user) return false;
  
  user.sessions = []; // Hapus semua sesi
  await saveUser(user);
  
  userCache.delete(sanitized); // Bersihkan cache
  
  return true;
}

/**
 * (BARU - TUGAS PRIORITAS 1)
 * Membersihkan semua sesi aktif dari SEMUA file user saat startup server.
 */
async function clearAllSessionsOnStartup() {
  console.log('[startup] Melakukan clear-down semua sesi pengguna (Clean Start)...');
  await ensureUsersDir(); // Pastikan folder ada
  
  try {
    const files = await fs.readdir(USERS_DIR);
    let clearedCount = 0;

    // Gunakan Promise.all untuk memproses secara paralel
    await Promise.all(files.map(async (f) => {
      if (!f.endsWith('.json')) return;
      const username = f.replace(/\.json$/i, '');
      
      try {
        const user = await loadUser(username);
        if (user && user.sessions && user.sessions.length > 0) {
          user.sessions = [];
          await saveUser(user);
          clearedCount++;
        }
      } catch (e) {
        console.warn(`[startup] Gagal membersihkan sesi untuk ${username}: ${e.message}`);
      }
    }));
    
    console.log(`[startup] Clean Start selesai. ${clearedCount} sesi pengguna dibersihkan.`);
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log('[startup] Direktori users belum ada, melewati pembersihan sesi.');
    } else {
      console.error(`[startup] Error saat clear-down sesi: ${e.message}`);
    }
  }
}


async function listActiveSessions(username) {
  const sanitized = sanitizeUsername(username);
  const user = await loadUser(sanitized);
  if (!user || !user.sessions) return [];
  return user.sessions.filter(s => s.status === 'active');
}

module.exports = {
  BASE_DIR,
  USERS_DIR,
  sanitizeUsername,
  ensureUsersDir,
  loadUser,
  saveUser,
  ensureUserExists,
  setPassword,
  verifyPassword,
  createSession,
  getSession,
  updateSessionLastSeen,
  invalidateSession,
  invalidateAllSessions,
  listActiveSessions,
  clearAllSessionsOnStartup // <-- (BARU) Ekspor fungsi
};
