// --- FRONTEND ---
// File: utils.js
/*
  FULL PRODUCTION MODE
  
  PERBAIKAN:
  - Import appState dari ./app.js (bukan dari state.js yang dihapus)
  - Tambah fungsi uploadDataset untuk Two-Phase Commit Pattern
*/

import { appState } from './app.js';

// --- Fungsi Helper Umum ---

export function getTimestamp() {
  return new Date().toLocaleTimeString();
}

export function addLog(type, message) {
  const logConsole = document.getElementById('log-console');
  if (!logConsole) return;

  const timestamp = getTimestamp();
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type.toLowerCase()}`;
  logEntry.textContent = `[${timestamp}] [${type}] ${message}`;
  logConsole.appendChild(logEntry);
  logConsole.scrollTop = logConsole.scrollHeight;
}

export function clearLogConsoleInstance() {
  const logConsole = document.getElementById('log-console');
  if (logConsole) {
    logConsole.innerHTML = '';
  }
}

export function isValidDomainOrUrl(input) {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim();
  
  const urlPattern = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(:\d+)?(\/.*)?$/i;
  return urlPattern.test(trimmed);
}

export function getHostname(urlOrDomain) {
  try {
    let url = urlOrDomain.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return urlOrDomain.trim();
  }
}

export function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

// ** Validation Error Modal **
export function showValidationErrorModal(errors) {
  const modal = document.getElementById('validation-error-modal');
  if (!modal) {
    console.warn('[showValidationErrorModal] Modal tidak ditemukan, menggunakan alert');
    alert('Validasi Error:\n\n' + errors.join('\n'));
    return;
  }
  
  const errorList = modal.querySelector('#validation-error-list');
  if (errorList) {
    errorList.innerHTML = '';
    errors.forEach(err => {
      const li = document.createElement('li');
      li.textContent = err;
      errorList.appendChild(li);
    });
  }
  
  modal.classList.remove('hidden');
}

export function hideValidationErrorModal() {
  const modal = document.getElementById('validation-error-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

// ** Force Logout (Session Expired) **
export function forceLogout(reason = 'Session expired') {
  console.warn('[forceLogout] Triggered:', reason);
  
  localStorage.removeItem('trafficBusterToken');
  
  appState.isAuthenticated = false;
  appState.user = null;
  appState.features = null;
  
  addLog('WARN', `Sesi berakhir: ${reason}. Silakan login kembali.`);
  
  import('./app.js').then(module => {
    module.showTab('profile');
  });
}

// ** API Call Wrapper (Auto-handle 401) **
export async function apiCall(url, options = {}) {
  try {
    if (appState.isAuthenticated && !options.skipAuth) {
      const token = localStorage.getItem('trafficBusterToken');
      if (token) {
        options.headers = {
          ...options.headers,
          'Authorization': `Bearer ${token}`
        };
      }
    }
    
    if (['POST', 'PUT', 'PATCH'].includes(options.method?.toUpperCase())) {
      options.headers = {
        'Content-Type': 'application/json',
        ...options.headers
      };
    }
    
    const response = await fetch(url, options);
    
    if (response.status === 401) {
      forceLogout('Backend menolak token (401)');
      throw new Error('UNAUTHORIZED');
    }
    
    if (response.status === 409) {
      const data = await response.json();
      throw new Error(data.message || 'Conflict');
    }
    
    const data = await response.json();
    
    if (!response.ok || data.success === false) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    
    return data;
    
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') {
      throw error;
    }
    
    console.error('[apiCall] Error:', error);
    throw error;
  }
}

// ** ==========================================
//    TWO-PHASE COMMIT - UPLOAD FUNCTIONS
//    ==========================================
// */

/**
 * Create Upload Session (Phase 1 - Step 1)
 * @param {string} backendHost - Host BE (misal: trafficbuster.my.id:5252)
 * @param {string} token - JWT token
 * @returns {Promise<{success: boolean, sessionId?: string, error?: string}>}
 */
export async function createUploadSession(backendHost, token) {
  try {
    addLog('INFO', 'Creating upload session...');
    
    const url = `https://${backendHost}/api/v1/upload/session/create`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 seconds
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.sessionId) {
      throw new Error('Invalid response from server');
    }
    
    addLog('SUCCESS', `Session created: ${data.sessionId}`);
    return { success: true, sessionId: data.sessionId };
    
  } catch (error) {
    addLog('ERROR', `Failed to create session: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Upload Tab Data (Phase 1 - Step 2)
 * @param {string} backendHost
 * @param {string} token
 * @param {string} sessionId
 * @param {string} tabName - 'targets' | 'proxies' | 'platforms' | 'settings'
 * @param {Array} items - Data array
 * @param {number} maxRetries - Max retry attempts (default: 3)
 * @returns {Promise<{success: boolean, uploaded?: number, error?: string}>}
 */
export async function uploadTabData(backendHost, token, sessionId, tabName, items, maxRetries = 3) {
  let attempt = 0;
  let lastError = null;
  
  while (attempt < maxRetries) {
    attempt++;
    
    try {
      if (attempt > 1) {
        addLog('WARN', `Retry ${attempt}/${maxRetries} for ${tabName}...`);
        // Wait 2 seconds before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        addLog('INFO', `Uploading ${tabName}... (${items.length} items)`);
      }
      
      const url = `https://${backendHost}/api/v1/upload/session/${sessionId}/${tabName}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: items,
          metadata: {
            totalCount: items.length,
            userLicense: appState.features?.license || 'Unknown',
            timestamp: new Date().toISOString()
          }
        }),
        timeout: 60000 // 60 seconds for large data
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Special handling for license errors (no retry)
        if (errorData.error === 'LICENSE_VIOLATION') {
          addLog('ERROR', `License violation: ${errorData.message}`);
          return { 
            success: false, 
            error: errorData.message,
            code: errorData.code,
            noRetry: true 
          };
        }
        
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Upload failed');
      }
      
      addLog('SUCCESS', `${tabName} uploaded successfully (${data.uploaded || items.length} items)`);
      return { success: true, uploaded: data.uploaded || items.length };
      
    } catch (error) {
      lastError = error;
      addLog('ERROR', `Upload ${tabName} attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      
      // If network error, retry
      // If other error, don't retry
      if (attempt >= maxRetries) {
        break;
      }
    }
  }
  
  // All retries failed
  addLog('ERROR', `Upload ${tabName} failed after ${maxRetries} attempts`);
  return { success: false, error: lastError?.message || 'Upload failed' };
}

/**
 * Commit Upload Session (Phase 1 - Step 3)
 * @param {string} backendHost
 * @param {string} token
 * @param {string} sessionId
 * @returns {Promise<{success: boolean, datasetIds?: object, error?: string}>}
 */
export async function commitUploadSession(backendHost, token, sessionId) {
  try {
    addLog('INFO', 'Committing upload session...');
    
    const url = `https://${backendHost}/api/v1/upload/session/${sessionId}/commit`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.datasetIds) {
      throw new Error('Invalid commit response');
    }
    
    addLog('SUCCESS', 'Session committed successfully!');
    addLog('INFO', `Dataset IDs: ${JSON.stringify(data.datasetIds)}`);
    
    return { success: true, datasetIds: data.datasetIds };
    
  } catch (error) {
    addLog('ERROR', `Commit failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Rollback Upload Session (on error)
 * @param {string} backendHost
 * @param {string} token
 * @param {string} sessionId
 * @returns {Promise<{success: boolean}>}
 */
export async function rollbackUploadSession(backendHost, token, sessionId) {
  try {
    addLog('WARN', 'Rolling back upload session...');
    
    const url = `https://${backendHost}/api/v1/upload/session/${sessionId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      timeout: 30000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    addLog('INFO', 'Session rolled back successfully');
    return { success: true };
    
  } catch (error) {
    addLog('ERROR', `Rollback failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Main Upload Function - Orchestrates the entire upload flow
 * @param {string} backendHost
 * @param {string} token
 * @param {Function} progressCallback - Callback untuk update progress UI
 * @returns {Promise<{success: boolean, datasetIds?: object, error?: string}>}
 */
export async function uploadAllDatasets(backendHost, token, progressCallback = null) {
  let sessionId = null;
  
  const uploadProgress = {
    targets: { status: 'pending', progress: 0, error: null },
    proxies: { status: 'pending', progress: 0, error: null },
    platforms: { status: 'pending', progress: 0, error: null },
    settings: { status: 'pending', progress: 0, error: null }
  };
  
  // Helper untuk update progress
  const updateProgress = (tabName, status, progress, error = null) => {
    uploadProgress[tabName] = { status, progress, error };
    if (progressCallback) {
      progressCallback(uploadProgress);
    }
  };
  
  try {
    // PHASE 1: Create Session
    const sessionResult = await createUploadSession(backendHost, token);
    if (!sessionResult.success) {
      throw new Error(sessionResult.error || 'Failed to create session');
    }
    sessionId = sessionResult.sessionId;
    
    // PHASE 2: Upload Per-Tab
    const tabs = [
      { name: 'targets', data: appState.generalTargets },
      { name: 'proxies', data: appState.geoProxies.filter(p => p.enabled) },
      { name: 'platforms', data: appState.platforms },
      { name: 'settings', data: [appState.settings] }
    ];
    
    for (const tab of tabs) {
      updateProgress(tab.name, 'uploading', 50);
      
      const uploadResult = await uploadTabData(
        backendHost, 
        token, 
        sessionId, 
        tab.name, 
        tab.data
      );
      
      if (!uploadResult.success) {
        updateProgress(tab.name, 'failed', 0, uploadResult.error);
        
        // If license violation, don't retry
        if (uploadResult.noRetry) {
          throw new Error(`License violation: ${uploadResult.error}`);
        }
        
        throw new Error(`Upload ${tab.name} failed: ${uploadResult.error}`);
      }
      
      updateProgress(tab.name, 'success', 100);
    }
    
    // PHASE 3: Commit Session
    const commitResult = await commitUploadSession(backendHost, token, sessionId);
    if (!commitResult.success) {
      throw new Error(commitResult.error || 'Commit failed');
    }
    
    return { 
      success: true, 
      datasetIds: commitResult.datasetIds 
    };
    
  } catch (error) {
    // Rollback on any error
    if (sessionId) {
      await rollbackUploadSession(backendHost, token, sessionId);
    }
    
    return { 
      success: false, 
      error: error.message 
    };
  }
}