/**
 * FRONTEND - socketClient.js
 * FINAL FIX - Force redirect on max attempts (2025-11-14 04:09:00 UTC)
 * 
 * CRITICAL FIX:
 * - Dispatch session-expired event after max reconnect attempts
 * - Assume session invalid if repeated 1006 errors
 */

import { addLog } from './utils.js';

const WS_HEARTBEAT_INTERVAL_MS = 60_000;
const SESSION_GRACE_MS = 5 * 60_000;
const WATCHDOG_TICK_MS = 10_000;
const REST_HEARTBEAT_INTERVAL_MS = 60_000;
const MAX_RECONNECT_ATTEMPTS = 6;
const INITIAL_RECONNECT_DELAY_MS = 2_000;
const STABLE_CONNECTION_MS = 500;

let ws = null;
let wsHost = null;
let wsToken = null;

let heartbeatTimer = null;
let watchdogTimer = null;
let restHeartbeatTimer = null;
let reconnectTimer = null;
let stableConnectionTimer = null;

let reconnectAttempts = 0;
let manualClose = false;
let lastAckTs = 0;
let sessionExpiredTriggered = false;

function clearAllTimers() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
  if (restHeartbeatTimer) { clearInterval(restHeartbeatTimer); restHeartbeatTimer = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (stableConnectionTimer) { clearTimeout(stableConnectionTimer); stableConnectionTimer = null; }
}

function dispatchSessionExpired(reason) {
  if (sessionExpiredTriggered) {
    console.log('[socketClient] Session expired already triggered');
    return;
  }
  
  sessionExpiredTriggered = true;
  
  try {
    const evt = new CustomEvent('backend-session-expired', { detail: { reason } });
    window.dispatchEvent(evt);
    addLog('WARN', `Session expired: ${reason}`);
    console.log('[socketClient] Dispatched backend-session-expired event');
  } catch (_) {}
}

function dispatchConnectionClosed(code) {
  try {
    const evt = new CustomEvent('backend-connection-closed', { detail: { code } });
    window.dispatchEvent(evt);
  } catch (_) {}
}

function dispatchHeartbeatAck() {
  try {
    const evt = new CustomEvent('backend-heartbeat-ack');
    window.dispatchEvent(evt);
  } catch (_) {}
}

function forwardWsMessage(payload) {
  try {
    const evt = new CustomEvent('backend-ws-message', { detail: payload });
    window.dispatchEvent(evt);
  } catch (_) {}
}

function startHeartbeatWatchdogLoops() {
  lastAckTs = Date.now();

  heartbeatTimer = setInterval(() => {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
    } catch (e) {
      addLog('ERROR', `WS heartbeat failed: ${e.message}`);
    }
  }, WS_HEARTBEAT_INTERVAL_MS);

  watchdogTimer = setInterval(() => {
    const delta = Date.now() - lastAckTs;
    if (delta > SESSION_GRACE_MS) {
      dispatchSessionExpired(`No heartbeat for ${Math.round(delta / 1000)}s`);
      disconnectWebSocket();
    }
  }, WATCHDOG_TICK_MS);

  restHeartbeatTimer = setInterval(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    if (!wsHost || !wsToken) return;
    try {
      const url = `https://${wsHost}/api/v1/heartbeat`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${wsToken}` }
      });
      if (resp.ok) {
        lastAckTs = Date.now();
      } else if (resp.status === 401 || resp.status === 403) {
        dispatchSessionExpired(`REST heartbeat rejected (${resp.status})`);
        disconnectWebSocket();
      }
    } catch (e) {}
  }, REST_HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeatWatchdogLoops() {
  clearAllTimers();
}

function scheduleReconnect() {
  if (manualClose) return;
  if (!wsHost || !wsToken) return;
  if (sessionExpiredTriggered) return;
  
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    addLog('WARN', 'Max reconnect attempts reached.');
    
    // ** CRITICAL FIX: Dispatch session-expired after max attempts **
    console.log('[socketClient] Max attempts reached, assuming session invalid');
    dispatchSessionExpired('Max reconnect attempts reached (likely invalid session)');
    return;
  }
  
  reconnectAttempts += 1;
  const delay = INITIAL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1);
  
  addLog('INFO', `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
  
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectWebSocket(wsHost, wsToken);
  }, delay);
}

export function connectWebSocket(host, token) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'Reconnecting');
    }
  } catch (_) {}
  ws = null;
  
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (watchdogTimer) clearInterval(watchdogTimer);
  if (restHeartbeatTimer) clearInterval(restHeartbeatTimer);
  if (stableConnectionTimer) clearTimeout(stableConnectionTimer);
  heartbeatTimer = null;
  watchdogTimer = null;
  restHeartbeatTimer = null;
  stableConnectionTimer = null;

  if (!host || !token) {
    addLog('ERROR', 'connectWebSocket requires host and token.');
    return;
  }

  wsHost = host;
  wsToken = token;

  const url = `wss://${host}/?token=${encodeURIComponent(token)}`;
  addLog('INFO', `Connecting WSS: ${url.replace(token, '***')} (token redacted)`);
  
  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      addLog('SUCCESS', 'WebSocket connected.');
      
      try { ws.send(JSON.stringify({ type: 'heartbeat' })); } catch (_) {}
      lastAckTs = Date.now();
      startHeartbeatWatchdogLoops();
      
      stableConnectionTimer = setTimeout(() => {
        reconnectAttempts = 0;
        console.log('[socketClient] Stable connection, reset counter');
      }, STABLE_CONNECTION_MS);
    };

    ws.onmessage = (event) => {
      let payload = null;
      try { payload = JSON.parse(event.data); } catch (e) { return; }
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'heartbeatAck') {
        lastAckTs = Date.now();
        dispatchHeartbeatAck();
        return;
      }

      if (payload.type === 'error') {
        const msg = payload.message || '';
        addLog('ERROR', `WSS error: ${msg}`);
        
        const sessionKeywords = ['session', 'sesi', 'auth', 'token', 'tidak aktif', 'digantikan', 'expired'];
        const isSessionError = sessionKeywords.some(k => msg.toLowerCase().includes(k.toLowerCase()));
        
        if (isSessionError) {
          dispatchSessionExpired(msg);
          disconnectWebSocket();
        }
        return;
      }

      if (payload.type === 'status' && payload.status === 'connected') {
        addLog('SUCCESS', `WSS authenticated: ${payload.userId}`);
        return;
      }

      forwardWsMessage(payload);
    };

    ws.onclose = (ev) => {
      addLog('WARN', `WebSocket closed (code=${ev.code}${ev.reason ? `, reason=${ev.reason}` : ''}).`);
      
      if (stableConnectionTimer) {
        clearTimeout(stableConnectionTimer);
        stableConnectionTimer = null;
      }
      
      stopHeartbeatWatchdogLoops();
      dispatchConnectionClosed(ev.code);
      
      // Check for session rejection in close reason
      if (ev.reason) {
        const sessionKeywords = ['session', 'sesi', 'auth', 'token', 'tidak aktif', 'digantikan', 'expired'];
        const isSessionError = sessionKeywords.some(k => ev.reason.toLowerCase().includes(k.toLowerCase()));
        
        if (isSessionError) {
          console.log('[socketClient] Session error detected in close reason:', ev.reason);
          dispatchSessionExpired(ev.reason);
          return;
        }
      }
      
      // ** UPDATED: Only trigger at MAX attempts (6), not early (3) **
      if (ev.code === 1006 && reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('[socketClient] Max attempts reached with repeated 1006 errors');
        dispatchSessionExpired('Max reconnect attempts reached (code 1006)');
        return;
      }
      
      if (!manualClose && !sessionExpiredTriggered) {
        scheduleReconnect();
      }
    };

    ws.onerror = (err) => {
      addLog('ERROR', `WebSocket error: ${err && err.message ? err.message : 'unknown'}`);
    };
    
  } catch (e) {
    addLog('ERROR', `Failed to create WebSocket: ${e.message}`);
    scheduleReconnect();
  }
}

export function disconnectWebSocket() {
  manualClose = true;
  clearAllTimers();
  if (ws) {
    try {
      addLog('INFO', 'Closing WebSocket...');
      ws.close(1000, 'Client closing');
    } catch (_) {}
  }
  ws = null;
  wsHost = null;
  wsToken = null;
  reconnectAttempts = 0;
  sessionExpiredTriggered = false;
}

export function isConnected() {
  return !!(ws && ws.readyState === WebSocket.OPEN);
}

export function resetReconnectState() {
  reconnectAttempts = 0;
  manualClose = false;
  sessionExpiredTriggered = false;
  console.log('[socketClient] Reconnect state manually reset');
}