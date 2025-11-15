/**
 * Frontend - auth.js
 * FINAL FIX (2025-11-14 04:09:30 UTC)
 * Force redirect to login on session expired
 */

import { appState, showTab } from './app.js';
import { addLog } from './utils.js';
import { connectWebSocket, disconnectWebSocket, resetReconnectState } from './socketClient.js';
import { DEFAULT_API_HOST } from './config.js';

const AUTH_TOKEN_KEY = 'trafficBusterToken';

async function handleLoginSuccess(userObject, token, host, features) {
  appState.isAuthenticated = true;
  appState.user = userObject;
  appState.features = features;
  
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  addLog('SUCCESS', `Login berhasil. Selamat datang, ${userObject.username}. Lisensi: ${userObject.license}`);
  addLog('SUCCESS', 'Koneksi API (HTTPS) aman telah dibuat.');
  
  // ** NEW: Download history after login (Todolist 17) **
  try {
    const apiHost = host || appState.backendHost;
    const historyUrl = `https://${apiHost}/api/v1/history`;
    
    const historyResponse = await fetch(historyUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (historyResponse.ok) {
      const historyData = await historyResponse.json();
      if (historyData.success && historyData.history) {
        appState.history = historyData.history;
        console.log(`[auth] Loaded ${historyData.history.length} history entries`);
        
        // Dispatch event for UI update
        window.dispatchEvent(new Event('history-updated'));
      }
    } else {
      console.warn('[auth] Failed to fetch history:', historyResponse.status);
    }
  } catch (e) {
    console.error('[auth] History fetch error:', e.message);
    // Non-critical, don't block login
  }
  
  try {
    resetReconnectState();
    connectWebSocket(host || appState.backendHost, token);
  } catch (e) {
    addLog('ERROR', `Gagal connect WSS: ${e.message}`);
  }
  
  setTimeout(() => {
    if (typeof window.triggerHealthCheck === 'function') {
      window.triggerHealthCheck();
    }
  }, 1000);
  
  setTimeout(() => {
    showTab('general');
  }, 500);
  
  return { success: true };
}

function handleLoginFail(errorMessage) {
  addLog('ERROR', `Login gagal: ${errorMessage}`);
  appState.isAuthenticated = false;
  appState.user = null;
  appState.features = null;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  return { success: false, message: errorMessage };
}

export async function login(username, password, host) {
  const apiHost = host || DEFAULT_API_HOST;
  const targetUrl = `https://${apiHost}/api/v1/login`;
  addLog('INFO', `Menghubungi server (secure): ${targetUrl}...`);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (response.status === 401) {
      return handleLoginFail('Username atau Password salah.');
    }

    if (response.status === 409) {
      let payload = {};
      try { payload = await response.json(); } catch (e) {}
      const msg = payload && payload.message ? payload.message : 'Active session exists. Please wait 5 minutes.';
      return handleLoginFail(msg);
    }

    if (!response.ok) {
      throw new Error(`Server merespon dengan status ${response.status}`);
    }

    const loginData = await response.json();
    if (!loginData.success) {
      return handleLoginFail(loginData.message || 'Backend merespon gagal.');
    }

    return handleLoginSuccess(loginData.user, loginData.token, apiHost, loginData.features);

  } catch (e) {
    addLog('ERROR', `Gagal koneksi ke server: ${e.message}`);
    return handleLoginFail('Gagal terhubung ke server.');
  }
}

export function logout() {
  addLog('WARN', 'Logout. Membersihkan sesi.');
  disconnectWebSocket();
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem('trafficBusterState');
  
  if (typeof window.updateHealthUI === 'function') {
    window.updateHealthUI('offline', 'Not logged in');
  }
  
  try {
    location.reload();
  } catch (e) {}
}

export async function initializeAuth() {
  const savedToken = localStorage.getItem(AUTH_TOKEN_KEY);
  
  if (!savedToken) {
    appState.isAuthenticated = false;
    appState.user = null;
    appState.features = null;
    addLog('INFO', 'Tidak ada sesi login. Silakan login.');
    
    // ** Setup listener even if not logged in **
    setupSessionExpiredListener();
    return;
  }

  addLog('INFO', 'Sesi token ditemukan. Memvalidasi ke server...');
  
  try {
    const apiHost = appState.backendHost || DEFAULT_API_HOST;
    const targetUrl = `https://${apiHost}/api/v1/validate`;
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${savedToken}` }
    });

    if (!response.ok) {
      throw new Error(`Token ditolak (${response.status})`);
    }
    
    const validationData = await response.json();
    
    if (validationData.success && validationData.user) {
      appState.isAuthenticated = true;
      appState.user = validationData.user;
      appState.features = validationData.features;
      
      addLog('SUCCESS', `Sesi '${validationData.user.username}' berhasil divalidasi.`);
      
      connectWebSocket(appState.backendHost || DEFAULT_API_HOST, savedToken);
      
      setTimeout(() => {
        if (typeof window.triggerHealthCheck === 'function') {
          window.triggerHealthCheck();
        }
      }, 2000);
      
    } else {
      throw new Error('Validasi gagal');
    }
  } catch (e) {
    addLog('WARN', `Sesi tidak valid: ${e.message}`);
    appState.isAuthenticated = false;
    appState.user = null;
    appState.features = null;
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }

  // ** Setup listener **
  setupSessionExpiredListener();
}

/**
 * Setup global session expired listener
 * ** CRITICAL: Force redirect to login page **
 */
function setupSessionExpiredListener() {
  window.addEventListener('backend-session-expired', (e) => {
    const reason = e.detail?.reason || 'Unknown';
    console.log('[auth] ========================================');
    console.log('[auth] SESSION EXPIRED EVENT RECEIVED');
    console.log('[auth] Reason:', reason);
    console.log('[auth] ========================================');
    
    addLog('WARN', `Session expired: ${reason}`);
    addLog('WARN', 'Redirecting to login page in 2 seconds...');
    
    // 1. Clear state
    appState.isAuthenticated = false;
    appState.user = null;
    appState.features = null;
    localStorage.removeItem(AUTH_TOKEN_KEY);
    
    // 2. Disconnect WS
    disconnectWebSocket();
    
    // 3. Update health UI
    if (typeof window.updateHealthUI === 'function') {
      window.updateHealthUI('offline', 'Session expired');
    }
    
    // 4. ** FORCE REDIRECT **
    setTimeout(() => {
      console.log('[auth] ========================================');
      console.log('[auth] FORCING REDIRECT TO LOGIN PAGE');
      console.log('[auth] ========================================');
      
      try {
        // Method 1: Direct showTab call
        showTab('profile');
        console.log('[auth] ✓ showTab("profile") executed');
      } catch (err) {
        console.error('[auth] ✗ showTab failed:', err);
        
        // Method 2: Fallback - reload page
        console.log('[auth] Fallback: reloading page...');
        location.reload();
      }
    }, 2000);
  }, { once: false }); // Allow multiple triggers
  
  console.log('[auth] Session expired listener installed');
}

export function checkAuth() {
  return appState.isAuthenticated;
}