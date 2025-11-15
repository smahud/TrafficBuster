/**
 * BACKEND - websocket.js
 * (PERBAIKAN: Nama fungsi tidak cocok dengan userStore.js)
 * - (FIX) Mengganti 'getActiveSession' -> 'getSession'
 * - (FIX) Mengganti 'updateSessionHeartbeat' -> 'updateSessionLastSeen'
 */
'use strict';

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./db');
// (PERBAIKAN NAMA FUNGSI)
const { getSession, updateSessionLastSeen } = require('./lib/userStore');
const { appendAudit } = require('./lib/audit');

let wss;

function sendToUser(userId, payload) {
  if (!wss) return;
  const message = (typeof payload === 'string') ? payload : JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.userId === userId) {
      try {
        client.send(message);
      } catch (e) {
        console.error(`[WSS] Gagal mengirim pesan ke ${userId}: ${e.message}`);
      }
    }
  });
}

function heartbeat() {
  this.isAlive = true;
}

function initializeWebSocket(httpsServer) {
  wss = new WebSocketServer({ server: httpsServer });

  wss.on('connection', async (ws, req) => {
    let token;
    
    try {
      const url = new URL(req.url, `wss://${req.headers.host}`);
      token = url.searchParams.get('token');
      if (!token) {
        throw new Error('Token tidak ditemukan di query URL');
      }
    } catch (e) {
      console.log('[WSS] Koneksi ditolak: Token tidak valid atau hilang.', e.message);
      ws.send(JSON.stringify({ success: false, code: 'TOKEN_MISSING', message: 'Token otentikasi tidak ditemukan.' }));
      ws.terminate();
      return;
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded || !decoded.userId || !decoded.sessionId) {
        throw new Error('Payload token tidak valid');
      }
    } catch (err) {
      console.log(`[WSS] Koneksi ditolak (userId: ${decoded ? decoded.userId : 'unknown'}): Token tidak valid.`, err.message);
      ws.send(JSON.stringify({ success: false, code: 'TOKEN_INVALID', message: `Token tidak valid: ${err.message}` }));
      ws.terminate();
      return;
    }

    const { userId, sessionId } = decoded;
    
    // (PERBAIKAN NAMA FUNGSI)
    const sessionValid = await getSession(userId, sessionId);
    
    if (!sessionValid || sessionValid.status !== 'active') { // (PERBAIKAN LOGIKA)
      console.log(`[WSS] Koneksi ditolak (userId: ${userId}): Sesi ${sessionId} tidak aktif atau digantikan.`);
      ws.send(JSON.stringify({ success: false, code: 'SESSION_INVALID', message: 'Sesi ini telah digantikan oleh login baru.' }));
      ws.terminate();
      return;
    }

    console.log(`[WSS] Koneksi (userId: ${userId}) berhasil diautentikasi.`);
    ws.userId = userId;
    ws.sessionId = sessionId;
    ws.isAlive = true;
    ws.send(JSON.stringify({ success: true, type: 'status', status: 'connected', userId: userId, sessionId: sessionId }));

    ws.on('pong', heartbeat);

    ws.on('message', async (messageBuffer) => {
      try {
        const message = JSON.parse(messageBuffer.toString());
        if (message.type === 'heartbeat') {
          ws.send(JSON.stringify({ type: 'heartbeatAck' }));
          // (PERBAIKAN NAMA FUNGSI)
          await updateSessionLastSeen(ws.userId, ws.sessionId);
        }
      } catch (e) {
        console.log(`[WSS] (userId: ${ws.userId}) Menerima pesan tidak valid: ${e.message}`);
      }
    });

    ws.on('close', () => {
      console.log(`[WSS] Koneksi (userId: ${ws.userId}) ditutup.`);
    });
    ws.on('error', (err) => {
      console.error(`[WSS] Error pada koneksi (userId: ${ws.userId}):`, err);
    });
  });

  const interval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (ws.isAlive === false) {
        console.log(`[WSS] (userId: ${ws.userId}) Gagal heartbeat (ping timeout). Memutuskan koneksi.`);
        return ws.terminate();
      }
      ws.isAlive = false; 
      ws.ping();
    });
  }, 30000); 

  wss.on('close', () => {
    clearInterval(interval);
  });
}

function shutdownWebSocket() {
  if (wss) {
    console.log('[shutdown] Menutup semua koneksi WebSocket...');
    wss.clients.forEach(client => {
      client.terminate();
    });
    wss.close();
  }
}

module.exports = { initializeWebSocket, sendToUser, shutdownWebSocket };
