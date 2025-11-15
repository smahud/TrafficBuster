/*
  websocket.js
  Logika server WebSocket (WSS) yang aman.
  
  PERBAIKAN KEAMANAN (SANGAT PENTING):
  - Mengganti 'jwt.decode()' (tidak aman) dengan 'jwt.verify()' (aman).
*/

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');
const { JWT_SECRET } = require('./db.js');

// Menyimpan klien yang terhubung, dipetakan berdasarkan userId
const clients = new Map();

function initializeWebSocket(httpsServer) {
  const wss = new WebSocketServer({ server: httpsServer });

  wss.on('connection', (ws, req) => {
    console.log('WSS: Klien baru mencoba terhubung...');
    
    const parameters = url.parse(req.url, true);
    const token = parameters.query.token;

    let userId;
    try {
      // ** PERUBAHAN KEAMANAN: dari jwt.decode() ke jwt.verify() **
      const decoded = jwt.verify(token, JWT_SECRET); 
      
      if (!decoded || !decoded.userId) {
        throw new Error('Token tidak valid atau tidak memiliki userId');
      }
      userId = decoded.userId;
      
    } catch (err) {
      // Jika token tidak valid, tolak koneksi
      console.log('WSS: Otentikasi token gagal:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed' }));
      ws.terminate();
      return;
    }

    // --- Otentikasi Berhasil ---
    
    clients.set(userId, ws);
    console.log(`WSS: Klien '${userId}' berhasil terhubung dan diautentikasi.`);
    
    ws.send(JSON.stringify({ type: 'status', status: 'connected', userId: userId }));

    ws.on('message', (message) => {
      console.log(`WSS: Menerima pesan dari '${userId}': ${message}`);
    });

    ws.on('close', () => {
      console.log(`WSS: Klien '${userId}' terputus.`);
      clients.delete(userId); 
    });
    
    ws.on('error', (err) => {
      console.log(`WSS: Error pada klien '${userId}': ${err.message}`);
      clients.delete(userId);
    });
  });

  console.log('Server WebSocket (WSS) siap dan terintegrasi dengan HTTPS.');
}

/**
 * Mengirim pesan (JSON) ke user tertentu jika mereka terhubung.
 * @param {string} userId - Username (misal: 'premium_user')
 * @param {object} data - Objek JSON yang akan dikirim
 */
function sendToUser(userId, data) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(data));
      console.log(`WSS: Mengirim data ke '${userId}'`);
    } catch (e) {
      console.error(`WSS: Gagal mengirim ke '${userId}': ${e.message}`);
    }
  } else {
    console.log(`WSS: Klien '${userId}' tidak terhubung, pesan tidak terkirim.`);
  }
}

module.exports = { initializeWebSocket, sendToUser };