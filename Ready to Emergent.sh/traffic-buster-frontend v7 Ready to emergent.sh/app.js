// --- FRONTEND ---
// File: app.js
/*
  FULL PRODUCTION MODE - NO DUMMY
  UPDATED: 2025-11-14 03:22:23 UTC (Health Check Integration)
  
  PERUBAHAN:
  - Hapus import USE_DUMMY_LOGIC & DUMMY_MODE_WARNING
  - setRunMode selalu false
  - Hapus warning dummy mode
  - Add health check monitoring (Todolist 16)
  - Expose health check functions to window
*/

// --- 1. Import Modul Logika ---
import { initializeGeneralTab } from './tab-general.js';
import { initializeGeoTab } from './tab-geolocation.js';
import { initializePlatformTab } from './tab-platform.js';
import { initializeSettingsTab } from './tab-settings.js';
import { initializeRunTab } from './tab-run.js';
import { initializeSchedulerTab } from './tab-scheduler.js';
import { initializeProfileTab } from './tab-profile.js';
import { initializeAuth, checkAuth } from './auth.js';
import { MODE, DEFAULT_API_HOST } from './config.js';
import * as socketClient from './socketClient.js';
import { 
  addLog, 
  deepMerge, 
  hideValidationErrorModal,
  clearLogConsoleInstance
} from './utils.js';

// --- 2. State Utama (DI-EXPORT) ---

const appStateDefault = {
  generalTargets: [],
  geoProxies: [],
  platforms: [],
  schedules: [],
  history: [], // ** NEW: History entries (Todolist 17) **
  user: null,
  isAuthenticated: false,
  jobStatus: { status: "idle" },
  backendHost: DEFAULT_API_HOST,
  platformDBVersion: '2025-11-10',
  features: null,
  settings: {
    trafficMode: 'Default',
    instanceCount: 1, 
    sessionDuration: { type: 'Constant', value: 2000, min: 4000, max: 4000 },
    platformSwitch: 'Single',
    trafficDelay: { type: 'Constant', value: 1000, min: 1000, max: 3000 },
    pageTraffic: { type: 'Total', value: 10, min: 1, max: 5 },
    pageOrder: 'Sequential',
    dnsConfig: { type: 'Proxy', custom: '' },
    proxySwitch: { type: 'Single', random: false, timeValue: 300000 },
    proxyBypass: { localhost: true, custom: false, customList: '' },
    proxyTestTimeout: 1000,
    humanSurfing: {
      autoPageScrolling: false, 
      surfingTime: { type: 'Constant', value: 1500, min: 1000, max: 3000 },
      autoClickRatio: false,
      internalClick: { enabled: false, value: 10 },
      externalClick: { enabled: false, value: 1 },
      interactionDepth: 3
    }
  }
};

export const appState = JSON.parse(JSON.stringify(appStateDefault));

// --- 4. Utilitas Global (DI-EXPORT) ---

export function resetAndReload() {
  if (appState.isAuthenticated) {
    if (!confirm('Apakah Anda yakin ingin me-reset semua pengaturan ke default pabrik? Semua URL dan proxy yang belum di-export akan hilang.')) {
      return;
    }
  }
  try {
    localStorage.removeItem(APP_STATE_KEY);
    localStorage.removeItem('trafficBusterToken');
    console.log('Resetting app to defaults...');
    location.reload();
  } catch (e) {
    console.error(`Gagal me-reset state: ${e.message}`);
  }
}


// --- 5. Manajemen State ---
const APP_STATE_KEY = 'trafficBusterState';

function saveState() {
  try {
    const stateToSave = { ...appState };
    delete stateToSave.user;
    delete stateToSave.isAuthenticated;
    delete stateToSave.jobStatus;
    delete stateToSave.features;
    
    const stateString = JSON.stringify(stateToSave);
    localStorage.setItem(APP_STATE_KEY, stateString);
    console.log('State (data) saved.');
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

function loadState() {
  const savedState = localStorage.getItem(APP_STATE_KEY);
  if (savedState) {
    try {
      const parsedState = JSON.parse(savedState);
      deepMerge(appState, parsedState);
      console.log('State terakhir (data) berhasil dimuat.');
    } catch (e) {
      console.warn('Gagal memuat state (data). Memulai dengan default.');
      localStorage.removeItem(APP_STATE_KEY);
    }
  } else {
    console.log('Tidak ada state (data) tersimpan. Memulai dengan default.');
  }
}

// --- 6. Logika Navigasi Tab ---
const contentArea = document.querySelector('.content-area');

function applyFeatureGating(tabId) {
  if (!appState.isAuthenticated || !appState.features) {
    return;
  }

  const features = appState.features;
  let featureKey = null;
  let featureName = null;

  switch (tabId) {
    case 'geolocation':
      if (!features.allowProxies) {
        featureKey = 'allowProxies';
        featureName = 'Geo Location / Proxy';
      }
      break;
    case 'platform':
      break;
    case 'settings':
       if (!features.allowSettingsAdvanced) {
        featureKey = 'allowSettingsAdvanced';
        featureName = 'Pengaturan Lanjutan (Human Surfing)';
      }
      break;
    case 'scheduler':
       if (!features.allowScheduler) {
        featureKey = 'allowScheduler';
        featureName = 'Scheduler';
      }
      break;
  }

  if (featureKey) {
    const overlayTemplate = document.getElementById('auth-overlay-template');
    if (overlayTemplate) {
      const overlayClone = overlayTemplate.cloneNode(true);
      overlayClone.id = 'auth-overlay-license';
      overlayClone.classList.remove('hidden');
      
      overlayClone.querySelector('h3').textContent = 'Fitur Terkunci';
      overlayClone.querySelector('p').textContent = `Fitur "${featureName}" tidak termasuk dalam lisensi '${features.license}' Anda. Silakan upgrade.`;
      const loginButton = overlayClone.querySelector('#auth-overlay-login-button');
      loginButton.textContent = 'Upgrade Lisensi (N/A)';
      loginButton.disabled = true;
      
      contentArea.innerHTML = '';
      contentArea.appendChild(overlayClone);
    }
    return false;
  }
  
  return true;
}

export async function showTab(tabId) {
  document.querySelectorAll('.sidebar-nav-item').forEach(nav => nav.classList.remove('tab-active'));
  const activeNav = document.getElementById(`nav-${tabId}`);
  if (activeNav) activeNav.classList.add('tab-active');

  try {
    const response = await fetch(`./tab-${tabId}.html?v=${new Date().getTime()}`);
    if (!response.ok) {
      throw new Error(`File tidak ditemukan: ./tab-${tabId}.html`);
    }
    const html = await response.text();
    contentArea.innerHTML = html;

    if (tabId !== 'profile') {
      const isAllowed = checkAuth();
      if (!isAllowed) {
        const overlayTemplate = document.getElementById('auth-overlay-template');
        if (overlayTemplate) {
          const overlayClone = overlayTemplate.cloneNode(true);
          overlayClone.id = 'auth-overlay-active';
          overlayClone.classList.remove('hidden');
          contentArea.innerHTML = '';
          contentArea.appendChild(overlayClone);
          contentArea.querySelector('#auth-overlay-login-button')
            .addEventListener('click', () => showTab('profile'));
        }
        return; 
      }
      
      const isLicensed = applyFeatureGating(tabId);
      if (!isLicensed) {
        return;
      }
    }

    switch (tabId) {
      case 'general': initializeGeneralTab(); break;
      case 'geolocation': initializeGeoTab(); break;
      case 'platform': initializePlatformTab(); break;
      case 'settings': initializeSettingsTab(); break;
      case 'profile': initializeProfileTab(); break;
      case 'scheduler': initializeSchedulerTab(); break;
      case 'run':
        clearLogConsoleInstance(); 
        initializeRunTab();
        break;
    }
  } catch (e) {
    console.error('Gagal memuat tab:', e);
    contentArea.innerHTML = `<div class="content-wrapper"><h2 class="content-title text-red-600">Error: Gagal memuat tab ${tabId}.</h2><p class="text-red-700">${e.message}</p></div>`;
  }
}

// --- 7. Inisialisasi Aplikasi ---
document.addEventListener('DOMContentLoaded', async () => {
  
  window.electronAPI.setRunMode(false);
  loadState();
  await initializeAuth(); 

  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      const tabId = item.getAttribute('data-tab');
      showTab(tabId);
    });
  });
  
  let initialTab = appState.isAuthenticated ? 'general' : 'profile';
  
  await showTab(initialTab);
  addLog('INFO', `Status Koneksi Internet: ${navigator.onLine ? 'Online' : 'Offline'}`);
  
  // ** NEW: Start health check monitoring (Todolist 16) **
  startHealthCheckMonitoring();
  
  window.addEventListener('beforeunload', () => {
    saveState();
  });
});


// ===================================
// HEALTH CHECK MONITORING (NEW - TODOLIST 16)
// Credit: smahud - 2025-11-14 03:22:23 UTC
// ===================================

let healthCheckInterval = null;
let lastHealthCheckStatus = null;

/**
 * Start periodic health check monitoring
 * Checks server every 30 seconds
 */
function startHealthCheckMonitoring() {
  const statusDot = document.getElementById('health-status-dot');
  const statusText = document.getElementById('health-status-text');
  
  if (!statusDot || !statusText) {
    console.warn('[healthCheck] Health indicator elements not found');
    return;
  }
  
  // Initial check
  checkServerHealth();
  
  // Periodic check every 30 seconds
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  healthCheckInterval = setInterval(() => {
    checkServerHealth();
  }, 30000); // 30 seconds
  
  console.log('[healthCheck] Monitoring started (30s interval)');
}

/**
 * Check server health via /api/v1/data/health endpoint
 * ** UPDATED: Auto-logout on 401/403 **
 */
async function checkServerHealth() {
  const statusDot = document.getElementById('health-status-dot');
  const statusText = document.getElementById('health-status-text');
  
  if (!statusDot || !statusText) return;
  
  // Don't check if not authenticated
  if (!appState.isAuthenticated) {
    updateHealthUI('offline', 'Not logged in');
    return;
  }
  
  try {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const response = await fetch(`https://${appState.backendHost}/api/v1/data/health`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const ping = Date.now() - startTime;
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        // ** NEW: Dispatch session expired event **
        console.log('[healthCheck] Auth failed (401/403), triggering logout');
        updateHealthUI('warning', 'Session expired');
        
        // Dispatch event to trigger logout
        const evt = new CustomEvent('backend-session-expired', { 
          detail: { reason: `Health check rejected (HTTP ${response.status})` } 
        });
        window.dispatchEvent(evt);
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.status === 'healthy') {
      // Server online
      if (ping > 2000) {
        // Slow connection
        updateHealthUI('warning', `Slow (${ping}ms)`);
      } else {
        updateHealthUI('online', `Online (${ping}ms)`);
      }
      lastHealthCheckStatus = 'online';
    } else {
      throw new Error('Unhealthy response');
    }
    
  } catch (error) {
    console.error('[healthCheck] Failed:', error.message);
    
    // Check if it's auth error
    if (error.message.includes('401') || error.message.includes('403')) {
      updateHealthUI('warning', 'Session expired');
      const evt = new CustomEvent('backend-session-expired', { 
        detail: { reason: 'Health check auth failed' } 
      });
      window.dispatchEvent(evt);
      lastHealthCheckStatus = 'warning';
    } else {
      updateHealthUI('offline', 'Server offline');
      lastHealthCheckStatus = 'offline';
    }
  }
}

/**
 * Update health indicator UI
 * @param {string} status - 'online' | 'warning' | 'offline'
 * @param {string} text - Status text to display
 */
function updateHealthUI(status, text) {
  const statusDot = document.getElementById('health-status-dot');
  const statusText = document.getElementById('health-status-text');
  
  if (!statusDot || !statusText) return;
  
  // Remove all status classes
  statusDot.classList.remove('health-dot-online', 'health-dot-offline', 'health-dot-warning');
  
  // Apply new status
  switch (status) {
    case 'online':
      statusDot.classList.add('health-dot-online');
      statusText.textContent = text;
      statusText.className = 'text-green-600 font-medium';
      break;
    case 'warning':
      statusDot.classList.add('health-dot-warning');
      statusText.textContent = text;
      statusText.className = 'text-yellow-600 font-medium';
      break;
    case 'offline':
      statusDot.classList.add('health-dot-offline');
      statusText.textContent = text;
      statusText.className = 'text-red-600 font-medium';
      break;
    default:
      statusText.textContent = text;
      statusText.className = 'text-gray-500';
  }
}

// Stop health check on session expire
window.addEventListener('backend-session-expired', () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  updateHealthUI('offline', 'Session expired');
  console.log('[healthCheck] Monitoring stopped (session expired)');
});

// ===================================
// EXPOSE FUNCTIONS TO WINDOW (for auth.js)
// ===================================

/**
 * Expose triggerHealthCheck to window for external triggers
 */
window.triggerHealthCheck = function() {
  console.log('[healthCheck] Manual trigger requested');
  checkServerHealth();
};

/**
 * Expose updateHealthUI to window for external updates
 */
window.updateHealthUI = updateHealthUI;

/**
 * Expose showTab to window for auth redirect
 */
window.showTab = showTab;

/**
 * Expose socketClient reset
 */
window.resetReconnectState = function() {
  import('./socketClient.js').then(module => {
    if (module.resetReconnectState) {
      module.resetReconnectState();
    }
  }).catch(err => {
    console.error('[app] Failed to reset reconnect state:', err);
  });
};

// ===================================
// EXPOSE FUNCTIONS TO WINDOW
// ===================================

window.triggerHealthCheck = function() {
  console.log('[healthCheck] Manual trigger');
  checkServerHealth();
};

window.updateHealthUI = updateHealthUI;

// ** NEW: Expose socketClient reset **
window.resetReconnectState = function() {
  import('./socketClient.js').then(module => {
    if (module.resetReconnectState) {
      module.resetReconnectState();
    }
  });
};