/*
  js/tab-platform.js
  
  PERBAIKAN:
  - Tambah validasi maxPlatforms untuk Free (max 3)
  - Validasi sebelum add platform manual
  - Validasi sebelum add random platforms
*/

// --- 1. Import State & Fungsi Global ---
import { appState } from './app.js';
import { addLog } from './utils.js';

// --- 2. Variabel DOM Modul ---
let platformTableBody;
let pfOs, pfOsVer, pfBrowser, pfBrowserVer, pfRes;
let addPlatformButton, clearPlatformButton;
let updatePlatformDbButton, platformDbStatus;
let randomPlatformButton, randomPlatformAmount;

// --- 3. Variabel State Modul ---
let fingerprintDB = []; 

// --- 4. Fungsi Helper Modul ---

function getUniqueValues(key, filterArray = null) {
  const source = filterArray || fingerprintDB;
  const uniqueSet = new Set(source.map(item => item[key]));
  return [...uniqueSet].sort();
}

function populateSelect(selectEl, options, placeholder = null) {
  selectEl.innerHTML = '';
  if (placeholder) {
    const ph = document.createElement('option');
    ph.value = "";
    ph.textContent = placeholder;
    selectEl.appendChild(ph);
  }
  options.forEach(option => {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = option;
    selectEl.appendChild(opt);
  });
  selectEl.disabled = options.length === 0;
}

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function updateOsVersions() {
  const selectedOs = pfOs.value;
  resetDropdowns(pfOsVer, pfBrowser, pfBrowserVer, pfRes);
  if (selectedOs) {
    const filteredDB = fingerprintDB.filter(p => p.osDevice === selectedOs);
    const versions = getUniqueValues("osVersion", filteredDB);
    populateSelect(pfOsVer, versions, "-- Pilih Versi --");
  }
}

function updateBrowsers() {
  const selectedOs = pfOs.value;
  const selectedVersion = pfOsVer.value;
  resetDropdowns(pfBrowser, pfBrowserVer, pfRes);
  if (selectedOs && selectedVersion) {
    const filteredDB = fingerprintDB.filter(p => p.osDevice === selectedOs && p.osVersion === selectedVersion);
    const browsers = getUniqueValues("browser", filteredDB);
    populateSelect(pfBrowser, browsers, "-- Pilih Browser --");
  }
}

function updateVersionsAndResolutions() {
  const selectedOs = pfOs.value;
  const selectedVersion = pfOsVer.value;
  const selectedBrowser = pfBrowser.value;
  resetDropdowns(pfBrowserVer, pfRes);
  if (selectedOs && selectedVersion && selectedBrowser) {
    const filteredDB = fingerprintDB.filter(p => 
      p.osDevice === selectedOs && 
      p.osVersion === selectedVersion && 
      p.browser === selectedBrowser
    );
    const versions = getUniqueValues("baseVersion", filteredDB);
    populateSelect(pfBrowserVer, versions, "-- Pilih Versi --");
    const allResolutions = filteredDB.reduce((acc, profile) => {
      return acc.concat(profile.resolutions);
    }, []);
    const uniqueResolutions = [...new Set(allResolutions)].sort();
    populateSelect(pfRes, uniqueResolutions);
    const defaultOpt = document.createElement('option');
    defaultOpt.value = "Default (Random)";
    defaultOpt.textContent = "Default (Random)";
    pfRes.prepend(defaultOpt);
    pfRes.value = "Default (Random)";
    pfRes.disabled = false;
  }
}

function resetDropdowns(...dropdowns) {
  dropdowns.forEach(dd => {
    dd.innerHTML = '<option value="">--</option>';
    dd.disabled = true;
  });
}

export function renderPlatformTable() {
  platformTableBody.innerHTML = '';
  if (appState.platforms.length === 0) {
     platformTableBody.innerHTML = `<tr><td colspan="7" class="table-cell text-center text-gray-500">No platforms added.</td></tr>`;
     return;
  }
  appState.platforms.forEach((p, index) => {
    const row = document.createElement('tr');
    row.className = "hover:bg-gray-50";
    row.innerHTML = `
      <td class="table-cell text-gray-600">${index + 1}</td>
      <td class="table-cell text-gray-900">${p.browser}</td>
      <td class="table-cell text-gray-600">${p.browserVersion}</td>
      <td class="table-cell text-gray-600">${p.os}</td>
      <td class="table-cell text-gray-600">${p.osVersion}</td>
      <td class="table-cell text-gray-600">${p.resolution}</td>
      <td class="table-cell text-right">
        <button data-index="${index}" class="text-red-600 hover:text-red-800 remove-btn-platform table-remove-btn">Remove</button>
      </td>
    `;
    platformTableBody.appendChild(row);
  });
}

/**
 * ** BARU: Validasi Max Platforms berdasarkan lisensi **
 */
function validateMaxPlatforms(newPlatformsCount = 1) {
  if (!appState.features || !appState.features.maxPlatforms) {
    return true; // Unlimited (Premium/Enterprise)
  }
  
  const currentCount = appState.platforms.length;
  const maxAllowed = appState.features.maxPlatforms;
  
  // Cek jika unlimited (9999)
  if (maxAllowed === 9999) {
    return true;
  }
  
  if (currentCount + newPlatformsCount > maxAllowed) {
    const remaining = maxAllowed - currentCount;
    addLog('ERROR', `Limit maksimal platform untuk lisensi '${appState.features.license}' adalah ${maxAllowed}. Saat ini: ${currentCount} platforms.`);
    
    if (remaining > 0) {
      alert(`Anda hanya bisa menambahkan ${remaining} platform lagi.\n\nLimit: ${maxAllowed} platforms\nSaat ini: ${currentCount} platforms\nLisensi: ${appState.features.license}`);
    } else {
      alert(`Limit maksimal platform tercapai!\n\nLimit: ${maxAllowed} platforms\nLisensi: ${appState.features.license}\n\nSilakan hapus platform lama atau upgrade lisensi.`);
    }
    return false;
  }
  
  return true;
}
  
// --- 5. Fungsi Inisialisasi (DI-EXPORT) ---
export function initializePlatformTab() {

  // --- A. Isi Variabel DOM ---
  addPlatformButton = document.getElementById('add-platform-button');
  clearPlatformButton = document.getElementById('clear-platform-button');
  platformTableBody = document.getElementById('platform-table-body');
  pfOs = document.getElementById('platform-os');
  pfOsVer = document.getElementById('platform-os-version');
  pfBrowser = document.getElementById('platform-browser');
  pfBrowserVer = document.getElementById('platform-browser-version');
  pfRes = document.getElementById('platform-resolution');
  updatePlatformDbButton = document.getElementById('update-platform-db');
  platformDbStatus = document.getElementById('platform-db-status');
  randomPlatformButton = document.getElementById('random-platform-button');
  randomPlatformAmount = document.getElementById('random-platform-amount');

  // --- B. Fungsi Load Data ---
  
  async function loadFingerprintDatabase() {
    platformDbStatus.textContent = 'Memuat data...';
    try {
      const response = await fetch(`./fingerprints.json?v=${new Date().getTime()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      fingerprintDB = await response.json();
      
      const osOptions = getUniqueValues("osDevice");
      populateSelect(pfOs, osOptions, "-- Pilih OS/Device --");
      resetDropdowns(pfOsVer, pfBrowser, pfBrowserVer, pfRes);
      
      platformDbStatus.textContent = `Data berhasil dimuat (${fingerprintDB.length} profil).`;
      addLog('SUCCESS', `Database Platform dimuat (${fingerprintDB.length} profil).`);

    } catch (e) {
      console.error('Gagal memuat database platform:', e);
      platformDbStatus.textContent = 'Gagal memuat data.';
      addLog('ERROR', `Gagal memuat fingerprints.json: ${e.message}`);
    }
  }

  // --- C. Daftarkan Event Listener ---

  updatePlatformDbButton.addEventListener('click', loadFingerprintDatabase);

  pfOs.addEventListener('change', updateOsVersions);
  pfOsVer.addEventListener('change', updateBrowsers);
  pfBrowser.addEventListener('change', updateVersionsAndResolutions);

  // ** PERBAIKAN: Tambah validasi sebelum add platform manual **
  addPlatformButton.addEventListener('click', () => {
    const os = pfOs.value;
    const osVersion = pfOsVer.value;
    const browser = pfBrowser.value;
    let browserVersion = pfBrowserVer.value;
    let resolution = pfRes.value;

    if (!os || !osVersion || !browser || !browserVersion || !resolution) {
      addLog('WARN', 'Harap lengkapi semua pilihan platform sebelum menambah.');
      return;
    }
    
    // ** BARU: Validasi maxPlatforms **
    if (!validateMaxPlatforms(1)) {
      return; // Batalkan jika limit tercapai
    }
    
    if (resolution === "Default (Random)") {
      const profiles = fingerprintDB.filter(p => 
        p.osDevice === os && 
        p.osVersion === osVersion && 
        p.browser === browser
      );
      const allResolutions = profiles.reduce((acc, p) => acc.concat(p.resolutions), []);
      
      if (allResolutions.length > 0) {
        resolution = getRandomItem([...new Set(allResolutions)]); 
      } else {
        resolution = "1920x1080"; 
      }
      addLog('INFO', `Resolusi default dipilih, diacak ke: ${resolution}`);
    }

    appState.platforms.push({
      browser: browser,
      browserVersion: browserVersion,
      os: os,
      osVersion: osVersion,
      resolution: resolution
    });
    
    renderPlatformTable();
    addLog('INFO', `Platform manual ditambahkan: ${os} - ${browser}`);
  });
  
  // ** PERBAIKAN: Tambah validasi sebelum add random platforms **
  randomPlatformButton.addEventListener('click', () => {
    if (fingerprintDB.length === 0) {
      addLog('WARN', 'Database platform belum dimuat. Klik "Update Platform Data" dahulu.');
      return;
    }
    
    const amount = parseInt(randomPlatformAmount.value, 10) || 1;
    
    // ** BARU: Validasi maxPlatforms **
    if (!validateMaxPlatforms(amount)) {
      return; // Batalkan jika limit tercapai
    }
    
    const popularProfiles = fingerprintDB.filter(p => p.popularity === 'high');
    
    if (popularProfiles.length === 0) {
      addLog('ERROR', 'Tidak ada profil "high" popularity di database.');
      return;
    }

    let addedCount = 0;
    for (let i = 0; i < amount; i++) {
      const randomProfile = getRandomItem(popularProfiles);
      const randomResolution = getRandomItem(randomProfile.resolutions);
      
      appState.platforms.push({
        browser: randomProfile.browser,
        browserVersion: randomProfile.baseVersion,
        os: randomProfile.osDevice,
        osVersion: randomProfile.osVersion,
        resolution: randomResolution
      });
      addedCount++;
    }
    
    renderPlatformTable();
    addLog('INFO', `Ditambahkan ${addedCount} platform populer (random).`);
  });

  platformTableBody.addEventListener('click', e => {
    if (e.target.classList.contains('remove-btn-platform')) {
      appState.platforms.splice(e.target.dataset.index, 1);
      renderPlatformTable();
    }
  });

  clearPlatformButton.addEventListener('click', () => {
    appState.platforms = [];
    renderPlatformTable();
  });

  // --- D. Panggilan Awal ---
  renderPlatformTable();
  loadFingerprintDatabase();
}