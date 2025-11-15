/*
  main.js
  FULL PRODUCTION MODE - PROXY TEST FIX
  
  CHANGES (2025-11-14):
  - proxy:test handler now connects to backend API
  - Timeout from slider is sent to backend
  - Real proxy test (no dummy)
*/

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let ACTIVE_JOB_CONFIG = {
  host: null,
  token: null
};

// Certificate error handler (production-safe)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  
  const trustedDomains = [
    'trafficbuster.my.id',
    'localhost'
  ];
  
  const urlObj = new URL(url);
  const isTrusted = trustedDomains.some(domain => urlObj.hostname.includes(domain));
  
  if (isTrusted) {
    console.log(`[SSL] Certificate accepted for: ${urlObj.hostname}`);
    callback(true);
  } else {
    console.warn(`[SSL] Certificate rejected for: ${urlObj.hostname}`);
    callback(false);
  }
});

// Security: Disable insecure features
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (parsedUrl.protocol !== 'file:' && 
        parsedUrl.protocol !== 'electron:' &&
        !parsedUrl.hostname.includes('trafficbuster.my.id') &&
        parsedUrl.hostname !== 'localhost') {
      console.warn('[Security] Blocked navigation to:', navigationUrl);
      event.preventDefault();
    }
  });
  
  contents.setWindowOpenHandler(({ url }) => {
    console.warn('[Security] Blocked window.open to:', url);
    return { action: 'deny' };
  });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');
  
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- IPC HANDLERS ---

ipcMain.on('set-run-mode', (event, isDev) => {
  console.log('[main] Mode: PRODUCTION (Dummy disabled)');
});

ipcMain.handle('dialog:openFile', async (event, filters) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ 
    properties: ['openFile'], 
    filters: filters || [
      { name: 'Text & CSV', extensions: ['txt', 'csv'] }, 
      { name: 'All Files', extensions: ['*'] }
    ] 
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('fs:readFile', async (event, filePath) => {
  try { 
    const data = fs.readFileSync(filePath, 'utf8'); 
    return { success: true, data: data }; 
  } catch (err) { 
    console.error('[main] Gagal membaca file:', err); 
    return { success: false, error: err.message }; 
  }
});

/**
 * ** UPDATED (2025-11-14): Real proxy test ke backend API **
 * Mengirim timeout dari slider ke backend
 */
ipcMain.handle('proxy:test', async (event, proxyConfig, timeout) => {
  console.log('[main] Proxy test requested:', proxyConfig.host, 'timeout:', timeout, 'ms');
  
  // Get backend host and token
  const backendHost = ACTIVE_JOB_CONFIG.host || 'trafficbuster.my.id:5252';
  const token = ACTIVE_JOB_CONFIG.token;
  
  if (!token) {
    console.error('[main] No auth token available for proxy test');
    return { 
      success: false, 
      error: 'Not authenticated. Please login first.' 
    };
  }
  
  try {
    const targetUrl = `https://${backendHost}/api/v1/data/proxy/test`;
    
    // Extract host and port from proxyConfig.host (format: "host:port")
    const hostParts = proxyConfig.host.split(':');
    const host = hostParts[0];
    const port = parseInt(hostParts[1], 10) || 80;
    
    console.log('[main] Sending test request to backend:', targetUrl);
    console.log('[main] Proxy:', host + ':' + port, '| Timeout:', timeout, 'ms');
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        host: host,
        port: port,
        username: proxyConfig.user || undefined,
        password: proxyConfig.pass || undefined,
        timeout: timeout || 10000  // ** TIMEOUT DARI SLIDER **
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }
    
    const result = await response.json();
    
    console.log('[main] Proxy test result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      return {
        success: true,
        speed: result.speed,
        protocol: result.protocol,
        country: result.country || 'Unknown'
      };
    } else {
      return {
        success: false,
        error: result.error || 'Test failed'
      };
    }
    
  } catch (error) {
    console.error('[main] Proxy test error:', error.message);
    return {
      success: false,
      error: error.message || 'Connection failed'
    };
  }
});

ipcMain.handle('dialog:saveFile', async (event, fileContent, filters) => {
  const { canceled, filePath } = await dialog.showSaveDialog({ 
    title: 'Simpan Konfigurasi Sebagai', 
    buttonLabel: 'Simpan', 
    filters: filters || [{ name: 'JSON Config', extensions: ['json'] }] 
  }); 
  
  if (canceled || !filePath) { 
    return { success: false, path: null }; 
  } 
  
  try { 
    fs.writeFileSync(filePath, fileContent, 'utf8'); 
    return { success: true, path: filePath }; 
  } catch (err) { 
    console.error('[main] Gagal menyimpan file:', err); 
    return { success: false, error: err.message }; 
  }
});

ipcMain.handle('get-job-status', () => {
  console.log('[main] Frontend meminta status job. Mode Produksi: Mengirim IDLE.');
  return { status: "idle", completed: 0, total: 0, success: 0, fail: 0 };
});

ipcMain.handle('start-traffic', async (event, configJson, token) => {
  console.log('[main] --- CONFIGURATION TO BE SENT TO BACKEND ---');
  
  event.sender.send('update-log', 'Sinyal START diterima. Meneruskan ke backend produksi...');
  
  try {
    const config = JSON.parse(configJson);
    const host = config.backendHost;
    
    ACTIVE_JOB_CONFIG = { host: host, token: token };
    
    const targetUrl = `https://${host}/api/v1/run/start`;
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: configJson
    });
    
    if (!response.ok) {
      throw new Error(`Backend merespon dengan status ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      event.sender.send('update-log', '(Produksi) Sinyal Start dikirim dan diterima oleh server.');
      return { success: true };
    } else {
      throw new Error(result.message || "Backend menolak untuk memulai.");
    }
    
  } catch (e) {
    console.error('[main] Gagal mengirim sinyal START ke backend:', e);
    event.sender.send('update-log', `(Produksi) ERROR: ${e.message}`);
    return { success: false, message: e.message };
  }
});

ipcMain.handle('stop-traffic', async (event, token) => {
  console.log('[main] --- SIGNAL STOP DITERIMA ---');
  
  event.sender.send('update-log', 'Sinyal STOP dikirim. Meneruskan ke backend produksi...');
  
  try {
    const { host, token } = ACTIVE_JOB_CONFIG;
    if (!host || !token) {
      throw new Error("Job tidak aktif, tidak ada host/token tersimpan.");
    }
    
    const targetUrl = `https://${host}/api/v1/run/stop`;
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Backend merespon dengan status ${response.status}`);
    }
    
    ACTIVE_JOB_CONFIG = { host: null, token: null };
    event.sender.send('update-log', '(Produksi) Sinyal Stop berhasil dikirim.');
    return { success: true };

  } catch (e) {
    console.error('[main] Gagal mengirim sinyal STOP ke backend:', e);
    event.sender.send('update-log', `(Produksi) ERROR: ${e.message}`);
    return { success: false, message: e.message };
  }
});

console.log('[main] Electron app initialized (PRODUCTION MODE)');
console.log('[main] App version:', app.getVersion());
console.log('[main] Electron version:', process.versions.electron);
console.log('[main] Chrome version:', process.versions.chrome);
console.log('[main] Node version:', process.versions.node);