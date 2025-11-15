// --- FRONTEND ---
// File: tab-run.js

/*
  js/tab-run.js
  FULL PRODUCTION MODE - NO DUMMY
  FIXED: pushServerConfigButton moved inside initializeRunTab()
  
  PERUBAHAN:
  - Hapus import USE_DUMMY_LOGIC
  - Hapus logic dummy di loadServerConfigButton
  - 'startButton' listener menghitung 'clickTarget' ('bbb') berdasarkan click ratio
  - 'handleRealtimeData' menangani 'clickDoneUpdate' ('aaa') untuk update 'target.clickDone'
  - FIX: pushServerConfigButton listener dipindah ke dalam initializeRunTab()
*/

// --- 1. Import State & Fungsi Global ---
import { appState, showTab, resetAndReload } from './app.js';
import { addLog, deepMerge, getTimestamp, showValidationErrorModal } from './utils.js';

// --- 2. Import Fungsi Lintas-Modul ---
import { renderGeneralTable } from './tab-general.js';
import { initializeGeoTab, renderProxyTable } from './tab-geolocation.js';
import { renderPlatformTable } from './tab-platform.js';
import { initializeSettingsTab } from './tab-settings.js';

// --- 3. Variabel State Modul ---
let startTime = null;
let timeMode = 'remaining';
let lastProgressData = null;

// --- 4. Fungsi Helper Modul ---

function formatTime(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "--:--:--";
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (num) => String(num).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function updateProgressUI(data) {
  lastProgressData = data;
  const progressBar = document.getElementById('progress-bar');
  const metricSuccess = document.getElementById('metric-success');
  const metricFail = document.getElementById('metric-fail');
  const metricTotal = document.getElementById('metric-total-completed');
  const progressTime = document.getElementById('progress-time');
  if (!progressBar) return;
  const { completed, total, success, fail } = data;
  const percentage = (total > 0) ? (completed / total) * 100 : 0;
  progressBar.style.width = `${percentage}%`;
  metricSuccess.textContent = success;
  metricFail.textContent = fail;
  metricTotal.textContent = `${completed} / ${total}`;
  if (startTime && completed > 0) {
    const elapsedTimeMs = new Date().getTime() - startTime.getTime();
    const elapsedTimeSec = elapsedTimeMs / 1000;
    const tasksPerSecond = completed / elapsedTimeSec;
    let timeString = "--:--:--";
    if (timeMode === 'remaining') {
      const tasksRemaining = total - completed;
      const timeRemainingSec = tasksRemaining / tasksPerSecond;
      timeString = formatTime(timeRemainingSec);
      progressTime.title = "Sisa Waktu (Klik untuk ganti ke Waktu Berlalu)";
    } else {
      timeString = formatTime(elapsedTimeSec);
      progressTime.title = "Waktu Berlalu (Klik untuk ganti ke Sisa Waktu)";
    }
    progressTime.textContent = timeString;
  }
}

async function saveLog() {
  const logConsole = document.getElementById('log-console');
  if (!logConsole) {
    addLog('ERROR', 'Tidak bisa menemukan konsol log.');
    return;
  }
  const logText = logConsole.innerText;
  const timestamp = getTimestamp();
  const defaultName = `trafficbuster_log_${timestamp}.txt`;
  const filters = [{ name: 'Log Files', extensions: ['txt'] }];
  addLog('INFO', 'Membuka dialog Save Log...');
  const result = await window.electronAPI.saveFile(logText, filters);
  if (result.success) {
    addLog('SUCCESS', `Log berhasil disimpan ke ${result.path}`);
  } else if (result.path === null) {
    addLog('WARN', 'Penyimpanan log dibatalkan.');
  } else {
    addLog('ERROR', `Gagal menyimpan log: ${result.error}`);
  }
}

function populateScheduleDropdown(selectElement) {
  selectElement.innerHTML = '';
  if (!appState.schedules || appState.schedules.length === 0) {
    selectElement.innerHTML = '<option value="">Tidak ada jadwal dibuat</option>';
    selectElement.disabled = true;
    return;
  }
  selectElement.disabled = false;
  selectElement.innerHTML = '<option value="">-- Pilih Jadwal --</option>';
  appState.schedules.forEach(task => {
    const option = document.createElement('option');
    option.value = task.id;
    option.textContent = `${task.name} (${task.occurrence})`;
    selectElement.appendChild(option);
  });
}

// Fungsi terpusat untuk menangani data real-time
function handleRealtimeData(data) {
  if (data && data.type === 'progressUpdate') {
    appState.jobStatus = { status: 'running', progressData: data };
    updateProgressUI(data);
  } 
  else if (data && data.type === 'status') {
    appState.jobStatus.status = data.status;
    const startButton = document.getElementById('start-button');
    const pauseButton = document.getElementById('pause-button');
    const stopButton = document.getElementById('stop-button');
    const runStatus = document.getElementById('run-status');
    const jobInfoText = document.getElementById('job-info-text');

    if (data.status === 'idle' && startButton) {
      startButton.classList.remove('hidden');
      pauseButton.classList.add('hidden');
      stopButton.classList.add('hidden');
      runStatus.textContent = 'Idle';
      if (jobInfoText) {
        jobInfoText.textContent = 'Menunggu perintah...';
      }
      startTime = null;
    }
  }
  else if (data && data.type === 'flowDoneUpdate') {
    const target = appState.generalTargets.find(t => t.id === data.targetId);
    if (target) {
      target.flowDone = data.flowDone;
      if (data.flowTarget) {
        target.flowTarget = data.flowTarget;
      }
      try {
        renderGeneralTable();
      } catch (e) {}
    }
  }
  else if (data && data.type === 'jobInfo') {
    const jobInfoText = document.getElementById('job-info-text');
    if (jobInfoText) {
      jobInfoText.textContent = data.message;
    }
  }
  else if (data && data.type === 'clickDoneUpdate') {
    const target = appState.generalTargets.find(t => t.id === data.targetId);
    if (target) {
      target.clickDone = data.clickDone;
      try { renderGeneralTable(); } catch (e) {}
    }
  }
}


// --- 5. Fungsi Inisialisasi (DI-EXPORT) ---
export function initializeRunTab() {

  // --- A. Ambil Elemen DOM ---
  const startButton = document.getElementById('start-button');
  const pauseButton = document.getElementById('pause-button');
  const stopButton = document.getElementById('stop-button');
  const clearLogButton = document.getElementById('clear-log-button');
  const logAutoSave = document.getElementById('log-auto-save');
  const logAutoClear = document.getElementById('log-auto-clear');
  const saveLogButton = document.getElementById('save-log-button');
  const logConsole = document.getElementById('log-console');
  const runStatus = document.getElementById('run-status');
  const progressTime = document.getElementById('progress-time');
  const startOptionNow = document.getElementById('start-option-now');
  const startOptionSchedule = document.getElementById('start-option-schedule');
  const runScheduleOptions = document.getElementById('run-schedule-options');
  const runScheduleSelect = document.getElementById('run-schedule-select');
  const importConfigButton = document.getElementById('import-config-button');
  const exportConfigButton = document.getElementById('export-config-button');
  const resetConfigButton = document.getElementById('reset-config-button');
  const loadServerConfigButton = document.getElementById('load-server-config-button');
  const pushServerConfigButton = document.getElementById('push-server-config-button'); // ** FIX: DIPINDAH KE SINI **
  const jobInfoText = document.getElementById('job-info-text');

  // --- B. Sinkronisasi UI dengan Job State ---
  const currentStatus = appState.jobStatus.status;
  runStatus.textContent = currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1);
  if (currentStatus === 'running' || currentStatus === 'paused') {
    startButton.classList.add('hidden');
    pauseButton.classList.remove('hidden');
    stopButton.classList.remove('hidden');
    if (currentStatus === 'paused') {
      pauseButton.textContent = 'Resume';
      pauseButton.classList.add('btn-primary');
      pauseButton.classList.remove('btn-secondary');
    }
    if (appState.jobStatus.progressData) {
      updateProgressUI(appState.jobStatus.progressData);
    }
    if (currentStatus === 'running') {
      startTime = new Date(); 
    }
    if (jobInfoText) {
      jobInfoText.textContent = 'Pekerjaan sedang berjalan... (Menunggu update dari backend)';
    }
  } else {
    startButton.classList.remove('hidden');
    pauseButton.classList.add('hidden');
    stopButton.classList.add('hidden');
  }

  // --- C. Fungsi Helper (Validasi) ---
  
  function refreshAllTabsUI() {
    addLog('INFO', 'Me-refresh UI dengan data baru...');
    renderGeneralTable();
    renderProxyTable();
    renderPlatformTable();
    initializeGeoTab();
    initializeSettingsTab();
    showTab('general');
  }

  // --- D. Daftarkan Event Listener ---
  
  startOptionNow.addEventListener('change', () => {
    runScheduleOptions.classList.add('hidden');
  });
  startOptionSchedule.addEventListener('change', () => {
    populateScheduleDropdown(runScheduleSelect);
    runScheduleOptions.classList.remove('hidden');
  });

  startButton.addEventListener('click', async () => {
    
    const validationErrors = [];
    const s = appState.settings;
    if (appState.generalTargets.length === 0) validationErrors.push('Tidak ada Target URL.');
    if (appState.platforms.length === 0) validationErrors.push('Tidak ada Platform.');
    if (s.useProxy && appState.geoProxies.filter(p => p.enabled).length === 0) validationErrors.push('Proxy aktif, tapi tidak ada proxy yang On.');
    if (s.humanSurfing.autoClickRatio) {
      const internalEnabled = s.humanSurfing.internalClick.enabled && s.humanSurfing.internalClick.value > 0;
      const externalEnabled = s.humanSurfing.externalClick.enabled && s.humanSurfing.externalClick.value > 0;
      if (!internalEnabled && !externalEnabled) {
        validationErrors.push('Auto Click aktif, tapi Internal/External Link tidak ada (atau nilai 0).');
      }
    }
    if (s.sessionDuration.type === 'Variable' && s.sessionDuration.min > s.sessionDuration.max) validationErrors.push('Session Duration: Min > Max.');
    if (s.trafficDelay.type === 'Variable' && s.trafficDelay.min > s.trafficDelay.max) validationErrors.push('Traffic Delay: Min > Max.');
    if (s.pageTraffic.type === 'Avg' && s.pageTraffic.min > s.pageTraffic.max) validationErrors.push('Page Traffic: Min > Max.');
    if (s.humanSurfing.surfingTime.type === 'Variable' && s.humanSurfing.surfingTime.min > s.humanSurfing.surfingTime.max) validationErrors.push('Surfing Time: Min > Max.');
    if (s.dnsConfig.type === 'Custom' && s.dnsConfig.custom.trim() === '') validationErrors.push('DNS Kustom dipilih, tapi daftar DNS kosong.');
    if (s.proxySwitch.type === 'Time' && (!s.proxySwitch.timeValue || s.proxySwitch.timeValue <= 0)) validationErrors.push('Proxy Switching "Time based" dipilih, tapi waktunya 0 atau kosong.');
    
    let isScheduled = false;
    if (startOptionSchedule.checked) {
      const selectedScheduleId = runScheduleSelect.value;
      if (!selectedScheduleId) {
        validationErrors.push('Harap pilih jadwal yang akan dijalankan dari dropdown.');
      } else {
        const schedule = appState.schedules.find(t => t.id === selectedScheduleId);
        if (!schedule) {
          validationErrors.push('Jadwal yang dipilih tidak valid (mungkin sudah dihapus).');
        } else if (new Date(schedule.startAt) < new Date()) {
          validationErrors.push('Jadwal yang dipilih sudah kadaluarsa (expired).');
        } else {
          isScheduled = true;
        }
      }
    }
    
    if (validationErrors.length > 0) {
      addLog('ERROR', 'Validasi gagal. Harap perbaiki kesalahan.');
      showValidationErrorModal(validationErrors);
      return;
    }
    
    // Hitung 'flowTarget' (yyyyy) & 'clickTarget' (bbb)
    appState.generalTargets.forEach(target => {
      if (!target.flowTarget) {
        if (s.pageTraffic.type === 'Total') {
          target.flowTarget = s.pageTraffic.value;
        } else {
          const min = s.pageTraffic.min || 1;
          const max = s.pageTraffic.max || 5;
          target.flowTarget = Math.floor(Math.random() * (max - min + 1)) + min;
        }
      }
      
      if (!target.clickTarget) {
        let internalRatio = 0;
        let externalRatio = 0;
        if (s.humanSurfing.autoClickRatio) {
          if (s.humanSurfing.internalClick.enabled) {
            internalRatio = (s.humanSurfing.internalClick.value || 0) / 100;
          }
          if (s.humanSurfing.externalClick.enabled) {
            externalRatio = (s.humanSurfing.externalClick.value || 0) / 100;
          }
        }
        target.clickTarget = Math.floor(target.flowTarget * (internalRatio + externalRatio));
      }
    });
    renderGeneralTable();
    
    if (isScheduled) {
      const schedule = appState.schedules.find(t => t.id === runScheduleSelect.value);
      addLog('SUCCESS', `Jadwal "${schedule.name}" berhasil disetel.`);
      addLog('INFO', `Proses akan dimulai secara otomatis pada: ${new Date(schedule.startAt).toLocaleString('id-ID')}`);
      return;
    }

    if (logAutoClear.checked) logConsole.innerHTML = '';
    
    startButton.classList.add('hidden');
    pauseButton.classList.remove('hidden');
    stopButton.classList.remove('hidden');
    runStatus.textContent = 'Starting...';
    addLog('INFO', 'Validasi sukses. Starting traffic generation...');
    
    startTime = new Date();
    timeMode = 'remaining';
    progressTime.dataset.mode = 'remaining';
    
    if (s.pageTraffic.type === 'Total') {
      const sMax = s.sessionDuration.type === 'Constant' ? s.sessionDuration.value : s.sessionDuration.max;
      const dMax = s.trafficDelay.type === 'Constant' ? s.trafficDelay.value : s.trafficDelay.max;
      const timePerFlowMs = (sMax || 0) + (dMax || 0);
      const totalEstimatedTimeSec = (timePerFlowMs * s.pageTraffic.value) / 1000;
      progressTime.textContent = formatTime(totalEstimatedTimeSec);
      addLog('INFO', `Estimasi Waktu: ${formatTime(totalEstimatedTimeSec)}`);
    } else {
      progressTime.textContent = "--:--:--";
      addLog('INFO', 'Mode "Avg traffic", estimasi waktu tidak tersedia.');
    }
    
    const payload = { ...appState, geoProxies: appState.geoProxies.filter(p => p.enabled) };
    
    try {
      const token = localStorage.getItem('trafficBusterToken');
      if (!token) {
        addLog('ERROR', 'Tidak ada token otentikasi. Silakan login ulang.');
        throw new Error('No auth token');
      }
      
      const result = await window.electronAPI.sendStartSignal(JSON.stringify(payload, null, 2), token);
      
      if (!result.success) {
        addLog('ERROR', `Backend gagal memulai: ${result.message}`);
        throw new Error(result.message);
      }
      
      addLog('SUCCESS', 'Sinyal Start berhasil dikirim dan diterima oleh backend.');
      
    } catch (e) {
      addLog('ERROR', `Gagal mengirim sinyal Start: ${e.message}`);
      startButton.classList.remove('hidden');
      pauseButton.classList.add('hidden');
      stopButton.classList.add('hidden');
      runStatus.textContent = 'Error.';
    }
  });

  stopButton.addEventListener('click', async () => {
    runStatus.textContent = 'Stopping...';
    addLog('WARN', 'Stopping traffic generation...');
    try {
      const token = localStorage.getItem('trafficBusterToken');
      if (!token) {
        addLog('ERROR', 'Tidak ada token otentikasi. Silakan login ulang.');
        throw new Error('No auth token');
      }
      const result = await window.electronAPI.sendStopSignal(token);
      if (!result.success) {
        addLog('ERROR', `Backend gagal berhenti: ${result.message}`);
      }
      startButton.classList.remove('hidden');
      pauseButton.classList.add('hidden');
      stopButton.classList.add('hidden');
      runStatus.textContent = 'Stopped.';
      startTime = null;
      if (logAutoSave.checked) {
        addLog('INFO', 'Auto-save log diaktifkan. Menyimpan log...');
        saveLog();
      }
    } catch (e) {
      addLog('ERROR', `Gagal mengirim sinyal Stop: ${e.message}`);
      runStatus.textContent = 'Error.';
    }
  });
  
  pauseButton.addEventListener('click', () => {
    const isPaused = pauseButton.textContent === 'Pause';
    pauseButton.textContent = isPaused ? 'Resume' : 'Pause';
    pauseButton.classList.toggle('btn-secondary');
    pauseButton.classList.toggle('btn-primary');
    runStatus.textContent = isPaused ? 'Paused.' : 'Running...';
    addLog('INFO', isPaused ? 'Pausing...' : 'Resuming...');
  });
  
  clearLogButton.addEventListener('click', () => {
    logConsole.innerHTML = '<div>[<span class="text-gray-500">...</span>] <span class="text-blue-400">INFO</span>: Log cleared.</div>';
    logConsole.querySelector('span.text-gray-500').textContent = new Date().toLocaleTimeString();
  });
  
  saveLogButton.addEventListener('click', saveLog);
  
  importConfigButton.addEventListener('click', async () => {
    addLog('INFO', 'Membuka dialog Import Config...');
    const filters = [{ name: 'JSON Config', extensions: ['json'] }];
    const filePath = await window.electronAPI.openFile(filters);
    if (!filePath) { addLog('WARN', 'Import dibatalkan.'); return; }
    const result = await window.electronAPI.readFile(filePath);
    if (!result.success) { addLog('ERROR', `Gagal membaca file: ${result.error}`); return; }
    try {
      const newState = JSON.parse(result.data);
      deepMerge(appState, newState);
      refreshAllTabsUI();
      addLog('SUCCESS', `Konfigurasi berhasil di-import dari ${filePath}`);
    } catch (e) { addLog('ERROR', `Gagal parsing JSON: ${e.message}`); }
  });

  exportConfigButton.addEventListener('click', async () => {
    addLog('INFO', 'Menyiapkan data untuk Export Config...');
    const configString = JSON.stringify(appState, null, 2);
    const filters = [{ name: 'JSON Config', extensions: ['json'] }];
    const result = await window.electronAPI.saveFile(configString, filters);
    if (result.success) { addLog('SUCCESS', `Konfigurasi di-export ke ${result.path}`); }
    else if (result.path === null) { addLog('WARN', 'Export dibatalkan.'); }
    else { addLog('ERROR', `Gagal menyimpan file: ${result.error}`); }
  });

  resetConfigButton.addEventListener('click', () => {
    resetAndReload();
  });
  
  // ** LOAD CONFIG FROM SERVER (TODOLIST 18) **
  loadServerConfigButton.addEventListener('click', async () => {
    addLog('INFO', 'Memuat config terakhir dari server...');
    
    try {
      const token = localStorage.getItem('trafficBusterToken');
      if (!token) {
        throw new Error('No auth token');
      }
      
      const response = await fetch(`https://${appState.backendHost}/api/v1/config`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 404) {
        addLog('INFO', 'Tidak ada config tersimpan di server.');
        return;
      }
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.config) {
        deepMerge(appState, data.config);
        refreshAllTabsUI();
        addLog('SUCCESS', 'Config berhasil dimuat dari server!');
      } else {
        throw new Error('Invalid config data');
      }
      
    } catch (e) {
      addLog('ERROR', `Gagal load config dari server: ${e.message}`);
    }
  });

  // ** FIX: PUSH CONFIG TO SERVER (DIPINDAH KE DALAM FUNCTION) **
  pushServerConfigButton.addEventListener('click', async () => {
    addLog('INFO', 'Menyimpan config ke server...');
    
    try {
      const token = localStorage.getItem('trafficBusterToken');
      if (!token) {
        throw new Error('No auth token');
      }
      
      // Prepare config data (exclude runtime data)
      const configToSave = {
        generalTargets: appState.generalTargets,
        geoProxies: appState.geoProxies.filter(p => p.enabled),
        platforms: appState.platforms,
        settings: appState.settings
      };
      
      const response = await fetch(`https://${appState.backendHost}/api/v1/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(configToSave)
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        addLog('SUCCESS', 'Config berhasil disimpan ke server!');
      } else {
        throw new Error(data.message || 'Failed to save config');
      }
      
    } catch (e) {
      addLog('ERROR', `Gagal push config ke server: ${e.message}`);
    }
  });

  progressTime.addEventListener('click', () => {
    timeMode = (timeMode === 'remaining') ? 'elapsed' : 'remaining';
    progressTime.dataset.mode = timeMode;
    if (lastProgressData) {
      updateProgressUI(lastProgressData);
    }
  });

  // --- E. Daftarkan Listener Global ---
  
  window.addEventListener('backend-data-update', (event) => {
    handleRealtimeData(event.detail);
  });
  
  window.electronAPI.onDataUpdate((data) => {
    handleRealtimeData(data);
  });
  
  window.electronAPI.onUpdateLog((value) => {
    addLog('BACKEND', value);
  });
}