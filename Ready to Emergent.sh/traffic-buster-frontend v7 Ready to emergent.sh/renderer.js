/*
  renderer.js
  PERUBAHAN v28 (Tugas 4):
  - Menambahkan 'flowDone: 0' saat menambah/mengimpor target baru.
  - 'renderGeneralTable()' dirombak untuk menampilkan kolom 'Flow Done' (colspan=8).
  - Menambahkan listener baru untuk 'reset-stats-button'.
*/

// State utama aplikasi untuk menyimpan semua data
const appState = {
  generalTargets: [], // Objek akan berisi { url, ..., flowDone: 0 }
  geoProxies: [], // Objek akan berisi { host, ..., enabled: true }
  platforms: [],
  settings: {
    trafficMode: 'Default',
    instanceCount: 1, 
    sessionDuration: {
      type: 'Constant',
      value: 2000,
      min: 4000,
      max: 4000,
      idleTime: 1000 
    },
    platformSwitch: 'Single',
    trafficDelay: {
      type: 'Constant',
      value: 1000,
      min: 1000,
      max: 3000
    },
    pageTraffic: {
      type: 'Total',
      value: 10,
      min: 1, 
      max: 5
    },
    pageOrder: 'Sequential',
    dnsConfig: {
      type: 'Proxy',
      custom: ''
    },
    proxySwitch: {
      type: 'Single',
      random: false
    },
    proxyBypass: {
      localhost: true,
      custom: false,
      customList: ''
    },
    proxyTestTimeout: 1000, // Dari Tugas 2
    humanSurfing: {
      autoPageScrolling: false, 
      surfingTime: { 
        type: 'Constant',
        value: 1500,
        min: 1000,
        max: 3000
      },
      autoClickRatio: false,
      internalClick: { 
        enabled: false,
        value: 10
      },
      externalClick: { 
        enabled: false,
        value: 1
      },
      interactionDepth: 3
    },
    backendConfig: {
      host: 'http://localhost:5151',
      apiKey: ''
    }
  }
};

// Data untuk dropdown kondisional
const organicSources = {
  "Search Engine": ["Google", "Bing", "Yahoo", "Baidu", "DuckDuckGo"],
  "Referral": ["Facebook", "X (Twitter)", "Instagram", "YouTube", "Custom"]
};

// Database Platform
const platformDatabase = {
  'Windows': {
    browsers: {
      'Chrome': ['120.0', '119.0', 'Random'],
      'Firefox': ['118.0', '117.0', 'Random'],
      'Edge': ['120.0', '119.0', 'Random']
    },
    versions: ['Windows 11', 'Windows 10', 'Windows 8.1', 'Windows 7'],
    resolutions: ['Default', '1920x1080', '1600x900', '1366x768']
  },
  'macOS': {
    browsers: {
      'Safari': ['17.0', '16.0', 'Random'],
      'Chrome': ['120.0', '119.0', 'Random'],
      'Firefox': ['118.0', '117.0', 'Random']
    },
    versions: ['macOS Sonoma', 'macOS Ventura', 'macOS Monterey'],
    resolutions: ['Default', '2560x1600', '1440x900', '1280x800']
  },
  'Linux': {
    browsers: {
      'Firefox': ['118.0', '117.0', 'Random'],
      'Chrome': ['120.0', '119.0', 'Random']
    },
    versions: ['Ubuntu 24.04', 'Ubuntu 22.04', 'Linux Mint 21'],
    resolutions: ['Default', '1920x1080', '1600x900']
  },
  'Android': {
    browsers: {
      'Chrome': ['120.0', '119.0', 'Random'],
      'Firefox': ['118.0', '117.0', 'Random'],
      'Samsung Internet': ['23.0', '22.0', 'Random']
    },
    versions: ['Android 14', 'Android 13', 'Android 12'],
    resolutions: ['Default', '360x740', '412x915', '390x844']
  },
  'iPhone': {
    browsers: {
      'Safari': ['17.0', '16.0', '15.0', 'Random']
    },
    versions: ['iOS 17', 'iOS 16', 'iOS 15'],
    resolutions: ['Default', '390x844', '428x926', '375x667']
  },
  'iPad': {
    browsers: {
      'Safari': ['17.0', '16.0', '15.0', 'Random']
    },
    versions: ['iPadOS 17', 'iPadOS 16'],
    resolutions: ['Default', '1024x768', '2048x1024']
  }
};

// Data Preset untuk Platform
const popularPresets = {
  'Desktop Populer': [
    { os: 'Windows', browser: 'Chrome', osVersion: 'Windows 11', resolution: '1920x1080' },
    { os: 'Windows', browser: 'Chrome', osVersion: 'Windows 10', resolution: '1920x1080' },
    { os: 'Windows', browser: 'Edge', osVersion: 'Windows 11', resolution: '1920x1080' },
    { os: 'macOS', browser: 'Safari', osVersion: 'macOS Sonoma', resolution: '1440x900' },
    { os: 'Windows', browser: 'Firefox', osVersion: 'Windows 10', resolution: '1366x768' }
  ],
  'Mobile Populer': [
    { os: 'iPhone', browser: 'Safari', osVersion: 'iOS 17', resolution: '390x844' },
    { os: 'Android', browser: 'Chrome', osVersion: 'Android 14', resolution: '412x915' },
    { os: 'iPhone', browser: 'Safari', osVersion: 'iOS 16', resolution: '390x844' },
    { os: 'Android', browser: 'Chrome', osVersion: 'Android 13', resolution: '360x740' },
    { os: 'Android', browser: 'Samsung Internet', osVersion: 'Android 14', resolution: '412x915' }
  ]
};

// Helper untuk mengambil item acak dari array
function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}


// Tunggu hingga seluruh halaman (HTML) selesai dimuat
document.addEventListener('DOMContentLoaded', () => {
  
  // --- 1. LOGIKA NAVIGASI TAB ---
  const tabNavItems = document.querySelectorAll('.sidebar-nav-item');
  const tabContents = document.querySelectorAll('.tab-content');

  function showTab(tabId) {
    tabContents.forEach(content => content.classList.add('hidden'));
    tabNavItems.forEach(nav => nav.classList.remove('tab-active'));
    
    const activeTabContent = document.getElementById(`tab-${tabId}`);
    if (activeTabContent) activeTabContent.classList.remove('hidden');
    
    const activeNav = document.getElementById(`nav-${tabId}`);
    if (activeNav) activeNav.classList.add('tab-active');
  }

  tabNavItems.forEach(item => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      const tabId = item.getAttribute('data-tab');
      showTab(tabId);
    });
  });

  showTab('general');

  // --- 2. LOGIKA UMUM & HELPER ---
  
  const logConsole = document.getElementById('log-console');
  const runStatus = document.getElementById('run-status');

  function addLog(level, message) {
    const timestamp = new Date().toLocaleTimeString();
    let lvlColor = 'text-blue-400'; // INFO
    if (level === 'WARN') lvlColor = 'text-yellow-400';
    if (level === 'ERROR') lvlColor = 'text-red-500';
    if (level === 'BACKEND') lvlColor = 'text-green-400';
    if (level === 'SUCCESS') lvlColor = 'text-green-400';
    
    const logEntry = document.createElement('div');
    const safeMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    logEntry.innerHTML = `[<span class="text-gray-500">${timestamp}</span>] <span class="${lvlColor}">${level}</span>: ${safeMessage}`;
    
    logConsole.appendChild(logEntry);
    logConsole.scrollTop = logConsole.scrollHeight;
  }
  
  logConsole.querySelector('div span.text-gray-500').textContent = new Date().toLocaleTimeString();

  function isValidDomainOrUrl(string) {
    const s = string.trim();
    if (!s || s.includes(' ') || !s.includes('.') || s.startsWith('.') || s.endsWith('.')) {
      return false;
    }
    return true;
  }
  
  function getHostname(url) {
    let hostname;
    let newUrl = url;
    if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
      newUrl = 'http://' + newUrl;
    }
    try {
      hostname = new URL(newUrl).hostname;
    } catch (_) {
      hostname = url.split('/')[0];
    }
    return hostname;
  }


  // --- 3. LOGIKA TAB GENERAL (PERUBAHAN v28) ---
  
  // Elemen Form
  const urlInput = document.getElementById('url-input');
  const trafficTypeDirect = document.getElementById('traffic-type-direct');
  const trafficTypeOrganic = document.getElementById('traffic-type-organic');
  
  // Elemen Conditional (Seluruh Kontainer)
  const organicOptionsContainer = document.getElementById('organic-options-container');
  
  // Elemen di dalam Kontainer
  const organicSourceTypeSelect = document.getElementById('organic-source-type');
  const organicSourceContentDiv = document.getElementById('organic-source-content-div');
  const organicSourceContentSelect = document.getElementById('organic-source-content');
  const organicSourceInputDiv = document.getElementById('organic-source-input-div');
  const organicSourceInputLabel = document.getElementById('organic-source-input-label');
  const organicSourceInput = document.getElementById('organic-source-input');
  
  // Elemen Tombol & Tabel
  const addUrlButton = document.getElementById('add-url-button');
  const importUrlButton = document.getElementById('import-url-button');
  const importStatus = document.getElementById('import-status');
  const clearTableButton = document.getElementById('clear-table-button');
  const resetStatsButton = document.getElementById('reset-stats-button'); // BARU v28
  const urlTableBody = document.getElementById('url-table-body');

  // Fungsi untuk reset semua Opsi Organic
  function resetOrganicOptions() {
    organicOptionsContainer.classList.add('hidden'); // Sembunyikan seluruh blok
    organicSourceContentDiv.classList.add('hidden');
    organicSourceInputDiv.classList.add('hidden');
    organicSourceTypeSelect.value = "";
    organicSourceContentSelect.innerHTML = "";
    organicSourceInput.value = "";
  }
  
  // Listener di Radio Button 'Traffic Type'
  [trafficTypeDirect, trafficTypeOrganic].forEach(radio => {
    radio.addEventListener('change', () => {
      if (trafficTypeOrganic.checked) {
        organicOptionsContainer.classList.remove('hidden'); // TAMPILKAN BLOK
      } else {
        resetOrganicOptions(); // SEMBUNYIKAN BLOK
      }
    });
  });

  // Listener di Dropdown 1 'Source Type'
  organicSourceTypeSelect.addEventListener('change', () => {
    const selectedType = organicSourceTypeSelect.value;
    organicSourceContentSelect.innerHTML = ""; // Kosongkan opsi
    organicSourceInputDiv.classList.add('hidden'); // Sembunyikan input
    
    if (selectedType && organicSources[selectedType]) {
      // Isi dropdown kedua
      organicSourceContentSelect.innerHTML = '<option value="">-- Pilih Source --</option>'; // Tambahkan default
      organicSources[selectedType].forEach(option => {
        const optEl = document.createElement('option');
        optEl.value = option;
        optEl.textContent = option;
        organicSourceContentSelect.appendChild(optEl);
      });
      
      // Tampilkan dropdown kedua
      organicSourceContentDiv.classList.remove('hidden');
      
      // Atur text box (input)
      if (selectedType === 'Search Engine') {
        organicSourceInputLabel.textContent = 'Keywords * (dipisah koma)';
        organicSourceInput.placeholder = "Keyword1, Keyword2...";
        organicSourceInputDiv.classList.remove('hidden'); // Selalu tampil untuk Search Engine
      }
      
      // Reset pilihan dropdown kedua
      organicSourceContentSelect.value = "";
      
    } else {
      // Sembunyikan jika "Pilih Tipe"
      organicSourceContentDiv.classList.add('hidden');
    }
  });

  // Fungsi utilitas untuk 'Custom Referral'
  function showCustomReferralInput() {
    organicSourceInputLabel.textContent = 'Custom Referral URL *';
    organicSourceInput.placeholder = 'my-blog.com';
    organicSourceInputDiv.classList.remove('hidden');
  }

  // Listener di Dropdown 2 'Source Content'
  organicSourceContentSelect.addEventListener('change', () => {
    const selectedType = organicSourceTypeSelect.value;
    const selectedContent = organicSourceContentSelect.value;
    
    if (selectedType === 'Referral' && selectedContent === 'Custom') {
      showCustomReferralInput();
    } else if (selectedType === 'Referral') {
      organicSourceInputDiv.classList.add('hidden'); // Sembunyikan untuk non-custom
    }
  });

  // PERUBAHAN v28: Render Tabel General
  function renderGeneralTable() {
    urlTableBody.innerHTML = '';
    if (appState.generalTargets.length === 0) {
       urlTableBody.innerHTML = `<tr><td colspan="8" class="table-cell text-center text-gray-500">No targets added.</td></tr>`; // Colspan jadi 8
       return;
    }
    appState.generalTargets.forEach((target, index) => {
      const row = document.createElement('tr');
      row.className = "hover:bg-gray-50";
      row.innerHTML = `
        <td class="table-cell text-gray-600">${index + 1}</td>
        <td class="table-cell text-gray-900 truncate" style="max-width: 150px;" title="${target.url}">${target.url}</td>
        <td class="table-cell text-gray-600">${target.website}</td>
        <td class="table-cell text-gray-600">${target.type}</td>
        <td class="table-cell text-gray-600">${target.source}</td>
        <td class="table-cell text-gray-600">${target.keyword}</td>
        <td class="table-cell text-gray-600 font-medium">${target.flowDone || 0}</td>
        <td class="table-cell text-right">
          <button data-index="${index}" class="text-red-600 hover:text-red-800 remove-btn-url table-remove-btn">Remove</button>
        </td>
      `;
      urlTableBody.appendChild(row);
    });
  }

  // Tombol Add URL
  addUrlButton.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!isValidDomainOrUrl(url)) {
      addLog('ERROR', 'Invalid URL. Masukkan domain yang valid (mis: google.com)');
      importStatus.textContent = 'Error: URL tidak valid.';
      return;
    }
    
    const hostname = getHostname(url);
    const commonData = { url: url, website: hostname, flowDone: 0 }; // BARU v28

    if (trafficTypeDirect.checked) {
      // --- Kasus 1: Direct ---
      appState.generalTargets.push({
        ...commonData,
        type: 'Direct',
        source: 'N/A',
        keyword: 'N/A',
      });
      importStatus.textContent = `Added Direct: ${url}`;

    } else { // 'Organic'
      const sourceType = organicSourceTypeSelect.value;
      const sourceContent = organicSourceContentSelect.value;
      const inputValue = organicSourceInput.value.trim();

      if (!sourceType || !sourceContent || sourceContent === "") {
        addLog('ERROR', 'Harap pilih Source Type dan Source.');
        importStatus.textContent = 'Error: Harap pilih Source Type dan Source.';
        return;
      }
      
      if (sourceType === 'Search Engine') {
        // --- Kasus 2: Organic - Search Engine ---
        const keywords = inputValue.split(',').map(k => k.trim()).filter(k => k);
        
        if (keywords.length > 0) {
          keywords.forEach(kw => {
            appState.generalTargets.push({
              ...commonData,
              type: 'Organic',
              source: sourceContent, // e.g., "Google"
              keyword: kw,
            });
          });
          importStatus.textContent = `Added ${keywords.length} keyword(s) for ${url}.`;
        } else {
          addLog('ERROR', 'Harap masukkan setidaknya satu keyword.');
          importStatus.textContent = 'Error: Harap masukkan keyword.';
          return; // Jangan tambahkan jika keyword kosong
        }
        
      } else { // 'Referral'
        // --- Kasus 3: Organic - Referral ---
        let source;
        if (sourceContent === 'Custom') {
          if (!isValidDomainOrUrl(inputValue)) {
             addLog('ERROR', 'Custom Referral URL tidak valid.');
             importStatus.textContent = 'Error: Custom Referral URL tidak valid.';
             return;
          }
          source = getHostname(inputValue); // Ambil domain saja
        } else {
          source = sourceContent; // e.g., "Facebook"
        }
          
        appState.generalTargets.push({
          ...commonData,
          type: 'Organic',
          source: source,
          keyword: 'N/A',
        });
        importStatus.textContent = `Added Referral (${source}) for ${url}.`;
      }
    }
    
    renderGeneralTable();
    urlInput.value = '';
    resetOrganicOptions(); // Reset form organic
    trafficTypeDirect.checked = true; // Kembali ke Direct
    addLog('INFO', 'Target ditambahkan ke list.');
  });
  
  // Hapus dari Tabel General
  urlTableBody.addEventListener('click', e => {
    if (e.target.classList.contains('remove-btn-url')) {
      appState.generalTargets.splice(e.target.dataset.index, 1);
      renderGeneralTable();
    }
  });

  // Hapus Semua
  clearTableButton.addEventListener('click', () => {
    appState.generalTargets = [];
    renderGeneralTable();
  });

  // PERUBAHAN v28 (Tugas 4): Listener BARU untuk Reset Statistik
  resetStatsButton.addEventListener('click', () => {
    appState.generalTargets.forEach(target => {
      target.flowDone = 0;
    });
    renderGeneralTable();
    addLog('INFO', 'Statistik "Flow Done" telah di-reset.');
  });

  // Import URLs
  importUrlButton.addEventListener('click', async () => {
    importStatus.textContent = 'Membuka dialog...';
    const filePath = await window.electronAPI.openFile([
      { name: 'Text & CSV', extensions: ['txt', 'csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]);
    if (!filePath) {
      importStatus.textContent = ''; return;
    }
    
    importStatus.textContent = `Membaca file...`;
    const result = await window.electronAPI.readFile(filePath);
    
    if (result.success) {
      const urls = result.data.split(/\r?\n/).map(u => u.trim()).filter(isValidDomainOrUrl);
      urls.forEach(url => {
        const hostname = getHostname(url);
        appState.generalTargets.push({
          url: url,
          website: hostname,
          type: 'Direct',
          source: 'N/A',
          keyword: 'N/A',
          flowDone: 0 // BARU v28
        });
      });
      renderGeneralTable();
      importStatus.textContent = `Imported ${urls.length} URLs.`;
      addLog('INFO', `Imported ${urls.length} URLs from file.`);
    } else {
      importStatus.textContent = 'Gagal membaca file.';
      addLog('ERROR', `File read error: ${result.error}`);
    }
  });

  // --- 4. LOGIKA TAB GEO LOCATION (PERUBAHAN v27) ---
  const proxyFileInput = document.getElementById('proxy-file-input');
  const importProxyFileButton = document.getElementById('import-proxy-file-button');
  const proxyHostInput = document.getElementById('proxy-host');
  const proxyUserInput = document.getElementById('proxy-user');
  const proxyPassInput = document.getElementById('proxy-pass');
  const addProxyButton = document.getElementById('add-proxy-button');
  const clearProxyButton = document.getElementById('clear-proxy-button');
  const proxyTableBody = document.getElementById('proxy-table-body');
  const enableProxyCheckbox = document.getElementById('enable-proxy-checkbox');
  const testProxyBeforeAddCheckbox = document.getElementById('test-proxy-before-add-checkbox');
  const proxyTestStatus = document.getElementById('proxy-test-status');
  
  // (v26) Elemen Slider
  const testTimeoutSlider = document.getElementById('test-timeout-slider');
  const testTimeoutLabel = document.getElementById('test-timeout-label');
  
  // (v18) Elemen Bypass Proxy
  const bypassLocalhost = document.getElementById('bypass-localhost');
  const bypassCustom = document.getElementById('bypass-custom');
  const bypassCustomList = document.getElementById('bypass-custom-list');

  // (v26) Listener untuk Slider
  testTimeoutSlider.addEventListener('input', () => {
    testTimeoutLabel.textContent = testTimeoutSlider.value;
  });

  // Listener untuk checkbox bypass custom
  bypassCustom.addEventListener('change', () => {
    if (bypassCustom.checked) {
      bypassCustomList.classList.remove('hidden');
    } else {
      bypassCustomList.classList.add('hidden');
    }
  });

  // PERUBAHAN v27 (Tugas 3): Rombak renderProxyTable
  function renderProxyTable() {
    proxyTableBody.innerHTML = '';
    if (appState.geoProxies.length === 0) {
       proxyTableBody.innerHTML = `<tr><td colspan="7" class="table-cell text-center text-gray-500">No proxies added.</td></tr>`;
       return;
    }
    appState.geoProxies.forEach((proxy, index) => {
      const row = document.createElement('tr');
      row.className = "hover:bg-gray-50";
      
      // Format Credential
      let credentialText = 'N/A';
      if (proxy.user && proxy.pass) {
        credentialText = `${proxy.user}:${proxy.pass}`;
      } else if (proxy.user) {
        credentialText = proxy.user;
      }
      
      const proxyId = `proxy-status-${index}`; // ID unik untuk radio group
      
      row.innerHTML = `
        <td class="table-cell text-gray-600">${index + 1}</td>
        <td class="table-cell text-gray-900 font-medium">${proxy.protocol || 'N/A'}</td>
        <td class="table-cell text-gray-900 truncate" style="max-width: 150px;" title="${proxy.host}">${proxy.host}</td>
        <td class="table-cell text-gray-600 truncate" style="max-width: 100px;" title="${credentialText}">${credentialText}</td>
        <td class="table-cell text-gray-600">${proxy.speed ? `${proxy.speed} ms` : 'N/A'}</td>
        <td class="table-cell text-gray-600">${proxy.country || 'N/A'}</td>
        <td class="table-cell text-right">
          <div class="flex items-center justify-end space-x-2">
            <!-- Toggle On/Off -->
            <div class="flex items-center space-x-1 text-xs">
              <input type="radio" id="${proxyId}-on" name="${proxyId}" value="on" class="form-radio proxy-status-toggle" data-index="${index}" ${proxy.enabled ? 'checked' : ''}>
              <label for="${proxyId}-on" class="cursor-pointer">On</label>
              <input type="radio" id="${proxyId}-off" name="${proxyId}" value="off" class="form-radio proxy-status-toggle" data-index="${index}" ${!proxy.enabled ? 'checked' : ''}>
              <label for="${proxyId}-off" class="cursor-pointer">Off</label>
            </div>
            <!-- Tombol Remove -->
            <button data-index="${index}" class="text-red-600 hover:text-red-800 remove-btn-proxy table-remove-btn ml-2">Remove</button>
          </div>
        </td>
      `;
      proxyTableBody.appendChild(row);
    });
  }

  // Fungsi untuk menambah proxy (dengan/tanpa tes)
  async function addProxy(proxyConfig) {
    // PERUBAHAN v27 (Tugas 3): Tambah 'enabled: true'
    if (!testProxyBeforeAddCheckbox.checked) {
      appState.geoProxies.push({
        ...proxyConfig,
        enabled: true, // Default On
        protocol: 'N/A' // Tidak dites
      });
      renderProxyTable();
      return true;
    }
    
    proxyTestStatus.textContent = `Testing ${proxyConfig.host}...`;
    addProxyButton.disabled = true;
    
    // (v26) Kirim timeout ke API
    const timeout = parseInt(testTimeoutSlider.value, 10) || 1000;
    const result = await window.electronAPI.testProxy(proxyConfig, timeout);
    
    if (result.success) {
      // PERUBAHAN v27 (Tugas 3): Tambah 'enabled: true' dan 'protocol'
      appState.geoProxies.push({
        ...proxyConfig,
        speed: result.speed,
        country: result.country,
        protocol: result.protocol,
        enabled: true // Default On
      });
      renderProxyTable();
      addLog('SUCCESS', `Proxy ${proxyConfig.host} work! (Speed: ${result.speed}ms, Proto: ${result.protocol})`);
      proxyTestStatus.textContent = `Sukses: ${proxyConfig.host}`;
      addProxyButton.disabled = false;
      return true;
    } else {
      addLog('ERROR', `Proxy ${proxyConfig.host} failed: ${result.error}`);
      proxyTestStatus.textContent = `Gagal: ${proxyConfig.host}`;
      addProxyButton.disabled = false;
      return false;
    }
  }

  // Tombol Add Proxy (manual)
  addProxyButton.addEventListener('click', async () => {
    const host = proxyHostInput.value.trim();
    const user = proxyUserInput.value.trim();
    const pass = proxyPassInput.value.trim();
    if (!host) return;
    
    const success = await addProxy({ 
      host, 
      user: user || null, 
      pass: pass || null 
    });
    
    if (success) {
      proxyHostInput.value = '';
      proxyUserInput.value = '';
      proxyPassInput.value = '';
    }
  });

  // Hapus Proxy & Toggle Status
  proxyTableBody.addEventListener('click', e => {
    // Tombol Remove
    if (e.target.classList.contains('remove-btn-proxy')) {
      appState.geoProxies.splice(e.target.dataset.index, 1);
      renderProxyTable();
    }
  });

  // PERUBAHAN v27 (Tugas 3): Listener BARU untuk toggle On/Off
  proxyTableBody.addEventListener('change', e => {
    if (e.target.classList.contains('proxy-status-toggle')) {
      const index = e.target.dataset.index;
      const isEnabled = (e.target.value === 'on');
      appState.geoProxies[index].enabled = isEnabled;
      // addLog('INFO', `Proxy ${appState.geoProxies[index].host} set to ${isEnabled ? 'ON' : 'OFF'}`);
    }
  });


  // Hapus Semua Proxy
  clearProxyButton.addEventListener('click', () => {
    appState.geoProxies = [];
    renderProxyTable();
  });

  // Import Proxy dari File
  importProxyFileButton.addEventListener('click', async () => {
    const filePath = await window.electronAPI.openFile([
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]);
    if (!filePath) return;
    
    proxyFileInput.value = filePath;
    const result = await window.electronAPI.readFile(filePath);
    
    if (result.success) {
      const lines = result.data.split(/\r?\n/).map(l => l.trim()).filter(l => l);
      let parsedProxies = [];
      
      lines.forEach(line => {
        const parts = line.split(':');
        let proxy = {};
        if (parts.length === 2) { // host:port
          proxy = { host: `${parts[0]}:${parts[1]}`, user: null, pass: null };
        } else if (parts.length === 4) { // host:port:user:pass
          proxy = { host: `${parts[0]}:${parts[1]}`, user: parts[2], pass: parts[3] };
        }
        if (proxy.host) {
          parsedProxies.push(proxy);
        }
      });
      
      if (!testProxyBeforeAddCheckbox.checked) {
        // PERUBAHAN v27 (Tugas 3): Tambah 'enabled: true'
        parsedProxies.forEach(p => {
          p.enabled = true;
          p.protocol = 'N/A';
        });
        appState.geoProxies.push(...parsedProxies);
        renderProxyTable();
        addLog('INFO', `Imported ${parsedProxies.length} proxies (no test).`);
        proxyTestStatus.textContent = `Imported ${parsedProxies.length} (no test).`;
      } else {
        addLog('INFO', `Testing ${parsedProxies.length} proxies from file...`);
        let successfulCount = 0;
        importProxyFileButton.disabled = true;
        addProxyButton.disabled = true;
        
        for (const proxy of parsedProxies) {
          const success = await addProxy(proxy); // addProxy sudah menangani 'enabled: true'
          if (success) successfulCount++;
        }
        
        addLog('SUCCESS', `Import finished. Added ${successfulCount} working proxies.`);
        proxyTestStatus.textContent = `Import finished. Added ${successfulCount}.`;
        importProxyFileButton.disabled = false;
        addProxyButton.disabled = false;
      }
    } else {
      addLog('ERROR', `File read error: ${result.error}`);
    }
  });


  // --- 5. LOGIKA TAB PLATFORM (LOGIKA BARU v23) ---
  const addPlatformButton = document.getElementById('add-platform-button');
  const clearPlatformButton = document.getElementById('clear-platform-button');
  const platformTableBody = document.getElementById('platform-table-body');
  
  const pfBrowser = document.getElementById('platform-browser');
  const pfOs = document.getElementById('platform-os');
  const pfBrowserVer = document.getElementById('platform-browser-version');
  const pfOsVer = document.getElementById('platform-os-version');
  const pfRes = document.getElementById('platform-resolution');
  
  const platformPreset = document.getElementById('platform-preset');
  const platformPresetAmountDiv = document.getElementById('platform-preset-amount-div');
  const platformPresetAmount = document.getElementById('platform-preset-amount');

  // Fungsi untuk mengisi dropdown
  function populateSelect(selectEl, options) {
    selectEl.innerHTML = '';
    options.forEach(option => {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      selectEl.appendChild(opt);
    });
  }

  // (v23) Fungsi BARU untuk update Browser Version
  function updateBrowserVersions() {
    const selectedOs = pfOs.value;
    const selectedBrowser = pfBrowser.value;
    if (!platformDatabase[selectedOs] || !platformDatabase[selectedOs].browsers[selectedBrowser]) {
      populateSelect(pfBrowserVer, ['Random']); // Fallback
      return;
    }
    
    const versions = platformDatabase[selectedOs].browsers[selectedBrowser];
    populateSelect(pfBrowserVer, versions);
  }

  // (v23) Fungsi update OS dirombak
  function updatePlatformDropdowns() {
    const selectedOs = pfOs.value;
    if (!platformDatabase[selectedOs]) return;
    
    const data = platformDatabase[selectedOs];
    
    // 1. Update Browser
    const browserList = Object.keys(data.browsers);
    populateSelect(pfBrowser, browserList);
    
    // 2. Update OS Version
    populateSelect(pfOsVer, data.versions);
    
    // 3. Update Resolution
    populateSelect(pfRes, data.resolutions);
    
    // 4. Trigger update untuk Browser Version (PENTING)
    updateBrowserVersions();
  }

  // Inisialisasi dropdown OS
  function initializePlatformDropdowns() {
    const osList = Object.keys(platformDatabase);
    populateSelect(pfOs, osList);
    // Set default ke 'Windows' dan trigger update
    pfOs.value = 'Windows';
    updatePlatformDropdowns();
  }

  // Listener untuk perubahan OS
  pfOs.addEventListener('change', updatePlatformDropdowns);
  
  // (v23) Listener BARU untuk perubahan Browser
  pfBrowser.addEventListener('change', updateBrowserVersions);

  // Listener untuk perubahan Preset
  platformPreset.addEventListener('change', () => {
    const presetValue = platformPreset.value;
    if (presetValue === 'Tanpa Preset') {
      platformPresetAmountDiv.classList.add('hidden');
    } else {
      platformPresetAmountDiv.classList.remove('hidden');
    }
  });

  // Render Tabel Platform
  function renderPlatformTable() {
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
  
  // (v23) Helper diperbarui untuk database baru
  function getRandomPlatform(presetType) {
    let osKey;
    let osPool = [];
    
    if (presetType === 'Desktop Populer') {
      osPool = popularPresets['Desktop Populer'];
      const randomEntry = getRandomItem(osPool);
      return { ...randomEntry, browserVersion: 'Random', osVersion: randomEntry.osVersion };
    }
    if (presetType === 'Mobile Populer') {
      osPool = popularPresets['Mobile Populer'];
      const randomEntry = getRandomItem(osPool);
      return { ...randomEntry, browserVersion: 'Random', osVersion: randomEntry.osVersion };
    }
    
    // Jika 'Random', buat dari database
    osPool = Object.keys(platformDatabase);
    osKey = getRandomItem(osPool);
    const osData = platformDatabase[osKey];
    const browserKey = getRandomItem(Object.keys(osData.browsers));
    const browserVersions = osData.browsers[browserKey];
    
    return {
      os: osKey,
      browser: browserKey,
      osVersion: getRandomItem(osData.versions),
      browserVersion: getRandomItem(browserVersions),
      resolution: getRandomItem(osData.resolutions.filter(r => r !== 'Default')) || 'Default'
    };
  }

  // Tombol Add Platform (Logika Ganda)
  addPlatformButton.addEventListener('click', () => {
    const preset = platformPreset.value;
    const amount = parseInt(platformPresetAmount.value, 10) || 1;

    if (preset === 'Tanpa Preset') {
      // Mode Manual: Tambah 1 dari form
      appState.platforms.push({
        browser: pfBrowser.value,
        browserVersion: pfBrowserVer.value,
        os: pfOs.value,
        osVersion: pfOsVer.value,
        resolution: pfRes.value
      });
      addLog('INFO', `Platform manual ditambahkan: ${pfOs.value}`);
    } else {
      // Mode Preset: Tambah X (jumlah) platform acak
      for (let i = 0; i < amount; i++) {
        appState.platforms.push(getRandomPlatform(preset));
      }
      addLog('INFO', `Ditambahkan ${amount} platform dari preset '${preset}'.`);
    }
    renderPlatformTable();
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


  // --- 6. LOGIKA TAB SETTINGS (LOGIKA BARU v19) ---
  
  // Instance Count
  const instanceCountInput = document.getElementById('instance-count');
  const trafficModeRadios = document.querySelectorAll('input[name="traffic-mode"]');
  
  // Backend
  const backendHostInput = document.getElementById('backend-host');
  const backendKeyInput = document.getElementById('backend-key');
  
  // Session
  const sessionTypeConstant = document.getElementById('session-duration-constant');
  const sessionDurationRadios = document.querySelectorAll('input[name="session-duration"]');
  const sessionConstantValue = document.getElementById('session-duration-constant-value');
  const sessionVariableMin = document.getElementById('session-duration-variable-min');
  const sessionVariableMax = document.getElementById('session-duration-variable-max');
  const humanIdleTime = document.getElementById('human-idle-time'); // Pindah ke sini
  
  // Platform Switch
  const platformSwitchRadios = document.querySelectorAll('input[name="platform-switch"]');
  
  // Traffic Delay
  const trafficDelayConstant = document.getElementById('traffic-delay-constant');
  const trafficDelayRadios = document.querySelectorAll('input[name="traffic-delay"]');
  const trafficDelayConstantValue = document.getElementById('traffic-delay-constant-value');
  const trafficDelayVariableMin = document.getElementById('traffic-delay-variable-min');
  const trafficDelayVariableMax = document.getElementById('traffic-delay-variable-max');
  
  // Page Traffic
  const pageTrafficTotal = document.getElementById('page-traffic-total');
  const pageTrafficAvg = document.getElementById('page-traffic-avg');
  const pageTrafficRadios = document.querySelectorAll('input[name="page-traffic"]');
  const pageTrafficTotalValue = document.getElementById('page-traffic-total-value');
  const pageTrafficAvgOptions = document.getElementById('page-traffic-avg-options');
  const pageTrafficAvgMin = document.getElementById('page-traffic-avg-min');
  const pageTrafficAvgMax = document.getElementById('page-traffic-avg-max');
  
  // DNS
  const dnsRadios = document.querySelectorAll('input[name="dns-config"]');
  const dnsCustomInput = document.getElementById('dns-custom-input');

  // Proxy Switch
  const proxySwitchRadios = document.querySelectorAll('input[name="proxy-switch"]');
  const proxySwitchRandom = document.getElementById('proxy-switch-random');
  
  // Human Surfing
  const humanAutoScroll = document.getElementById('human-auto-scroll');
  const humanAutoScrollOptions = document.getElementById('human-auto-scroll-options');
  const humanSurfingTimeRadios = document.querySelectorAll('input[name="surfing-time-type"]');
  const humanSurfingTimeConstant = document.getElementById('human-surfing-time-constant');
  const humanSurfingTimeVariable = document.getElementById('human-surfing-time-variable');
  const humanSurfingTimeMin = document.getElementById('human-surfing-time-min');
  const humanSurfingTimeMax = document.getElementById('human-surfing-time-max');
  
  const humanAutoClick = document.getElementById('human-auto-click');
  const humanAutoClickOptions = document.getElementById('human-auto-click-options');
  
  const humanInternalClick = document.getElementById('human-internal-click');
  const humanInternalClickOptions = document.getElementById('human-internal-click-options');
  const humanInternalClickValue = document.getElementById('human-internal-click-value'); // BARU
  
  const humanExternalClick = document.getElementById('human-external-click');
  const humanExternalClickOptions = document.getElementById('human-external-click-options');
  const humanExternalClickValue = document.getElementById('human-external-click-value'); // BARU
  
  const humanInteractionDepth = document.getElementById('human-interaction-depth');
  // humanBounceRate DIHAPUS

  
  // --- Listener Baru v19 ---
  
  // Page Traffic
  pageTrafficRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      pageTrafficTotalValue.classList.toggle('hidden', !pageTrafficTotal.checked);
      pageTrafficAvgOptions.classList.toggle('hidden', !pageTrafficAvg.checked);
    });
  });

  // DNS
  dnsRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      dnsCustomInput.classList.toggle('hidden', !(radio.value === 'Custom' && radio.checked));
    });
  });

  // Auto Page Scrolling
  humanAutoScroll.addEventListener('change', () => {
    humanAutoScrollOptions.classList.toggle('hidden', !humanAutoScroll.checked);
  });
  humanSurfingTimeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      humanSurfingTimeConstant.classList.toggle('hidden', radio.value !== 'Constant');
      humanSurfingTimeVariable.classList.toggle('hidden', radio.value !== 'Variable');
    });
  });
  
  // Auto Click Ratio
  humanAutoClick.addEventListener('change', () => {
    humanAutoClickOptions.classList.toggle('hidden', !humanAutoClick.checked);
  });
  
  // Internal Click
  humanInternalClick.addEventListener('change', () => {
    humanInternalClickOptions.classList.toggle('hidden', !humanInternalClick.checked);
  });
  
  // External Click
  humanExternalClick.addEventListener('change', () => {
    humanExternalClickOptions.classList.toggle('hidden', !humanExternalClick.checked);
  });
  
  // --- FUNGSI BARU v19: PRESET ---
  
  // Fungsi untuk update UI dari appState (untuk preset)
  function updateSettingsUIFromState() {
    const s = appState.settings;
    
    // Instance Count
    instanceCountInput.value = s.instanceCount;
    
    // Session Duration
    document.querySelector(`input[name="session-duration"][value="${s.sessionDuration.type}"]`).checked = true;
    sessionConstantValue.value = s.sessionDuration.value;
    sessionVariableMin.value = s.sessionDuration.min;
    sessionVariableMax.value = s.sessionDuration.max;
    humanIdleTime.value = s.sessionDuration.idleTime;
    
    // Human Surfing
    humanAutoScroll.checked = s.humanSurfing.autoPageScrolling;
    humanAutoScrollOptions.classList.toggle('hidden', !s.humanSurfing.autoPageScrolling);
    
    humanAutoClick.checked = s.humanSurfing.autoClickRatio;
    humanAutoClickOptions.classList.toggle('hidden', !s.humanSurfing.autoClickRatio);
    
    humanInternalClick.checked = s.humanSurfing.internalClick.enabled;
    humanInternalClickOptions.classList.toggle('hidden', !s.humanSurfing.internalClick.enabled);
    humanInternalClickValue.value = s.humanSurfing.internalClick.value;
    
    humanExternalClick.checked = s.humanSurfing.externalClick.enabled;
    humanExternalClickOptions.classList.toggle('hidden', !s.humanSurfing.externalClick.enabled);
    humanExternalClickValue.value = s.humanSurfing.externalClick.value;
    
    humanInteractionDepth.value = s.humanSurfing.interactionDepth;
    
    // ... update sisanya jika diperlukan ...
  }
  
  // Fungsi untuk menerapkan preset
  function applyPreset(mode) {
    if (!presets[mode]) return;
    
    const presetSettings = presets[mode];
    
    // Gabungkan preset ke appState
    appState.settings.sessionDuration = { ...appState.settings.sessionDuration, ...presetSettings.sessionDuration };
    appState.settings.humanSurfing = { ...appState.settings.humanSurfing, ...presetSettings.humanSurfing };
    
    // Perbarui UI
    updateSettingsUIFromState();
    addLog('INFO', `Preset '${mode}' diterapkan.`);
  }
  
  // Terapkan listener ke Traffic Mode Radios
  trafficModeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      applyPreset(radio.value);
    });
  });


  // Fungsi untuk mengumpulkan SEMUA settings
  function gatherSettings() {
    // Instance Count
    appState.settings.instanceCount = parseInt(instanceCountInput.value, 10) || 1;
    
    // Backend
    appState.settings.backendConfig.host = backendHostInput.value;
    appState.settings.backendConfig.apiKey = backendKeyInput.value;
    
    // Mode
    appState.settings.trafficMode = document.querySelector('input[name="traffic-mode"]:checked').value;
    
    // Session
    const sessionType = document.querySelector('input[name="session-duration"]:checked').value;
    appState.settings.sessionDuration = {
      type: sessionType,
      value: (sessionType === 'Constant') ? parseInt(sessionConstantValue.value, 10) : null,
      min: (sessionType === 'Variable') ? parseInt(sessionVariableMin.value, 10) : null,
      max: (sessionType === 'Variable') ? parseInt(sessionVariableMax.value, 10) : null,
      idleTime: parseInt(humanIdleTime.value, 10)
    };
    
    // Platform Switch
    appState.settings.platformSwitch = document.querySelector('input[name="platform-switch"]:checked').value;
    
    // Traffic Delay
    const delayType = document.querySelector('input[name="traffic-delay"]:checked').value;
    appState.settings.trafficDelay = {
      type: delayType,
      value: (delayType === 'Constant') ? parseInt(trafficDelayConstantValue.value, 10) : null,
      min: (delayType === 'Variable') ? parseInt(trafficDelayVariableMin.value, 10) : null,
      max: (delayType === 'Variable') ? parseInt(trafficDelayVariableMax.value, 10) : null
    };
    
    // Page Traffic
    const trafficType = document.querySelector('input[name="page-traffic"]:checked').value;
    appState.settings.pageTraffic = {
      type: trafficType,
      value: (trafficType === 'Total') ? parseInt(pageTrafficTotalValue.value, 10) : null,
      min: (trafficType === 'Avg') ? parseInt(pageTrafficAvgMin.value, 10) : null,
      max: (trafficType === 'Avg') ? parseInt(pageTrafficAvgMax.value, 10) : null
    };
    
    // Page Order
    appState.settings.pageOrder = document.querySelector('input[name="page-order"]:checked').value;
    
    // DNS
    const checkedDns = document.querySelector('input[name="dns-config"]:checked');
    appState.settings.dnsConfig = {
      type: checkedDns.value,
      custom: (checkedDns.value === 'Custom') ? dnsCustomInput.value : ''
    };
    
    // Proxy Switch
    appState.settings.proxySwitch = {
      type: document.querySelector('input[name="proxy-switch"]:checked').value,
      random: proxySwitchRandom.checked
    };
    
    // Proxy (dari Tab Geo)
    appState.settings.useProxy = enableProxyCheckbox.checked;
    appState.settings.proxyBypass = {
      localhost: bypassLocalhost.checked,
      custom: bypassCustom.checked,
      customList: bypassCustomList.value
    };
    
    // (v26) Kumpulkan data slider
    appState.settings.proxyTestTimeout = parseInt(testTimeoutSlider.value, 10) || 1000;
    
    // Human Surfing
    const surfingTimeType = document.querySelector('input[name="surfing-time-type"]:checked').value;
    
    appState.settings.humanSurfing = {
      autoPageScrolling: humanAutoScroll.checked,
      surfingTime: {
        type: surfingTimeType,
        value: (surfingTimeType === 'Constant') ? parseInt(humanSurfingTimeConstant.value, 10) : null,
        min: (surfingTimeType === 'Variable') ? parseInt(humanSurfingTimeMin.value, 10) : null,
        max: (surfingTimeType === 'Variable') ? parseInt(humanSurfingTimeMax.value, 10) : null
      },
      autoClickRatio: humanAutoClick.checked,
      internalClick: {
        enabled: humanInternalClick.checked,
        value: parseInt(humanInternalClickValue.value, 10) || 0
      },
      externalClick: {
        enabled: humanExternalClick.checked,
        value: parseInt(humanExternalClickValue.value, 10) || 0
      },
      interactionDepth: parseInt(humanInteractionDepth.value, 10)
    };
  }
  
  // Load nilai awal ke UI
  backendHostInput.value = appState.settings.backendConfig.host;
  backendKeyInput.value = appState.settings.backendConfig.apiKey;
  bypassLocalhost.checked = appState.settings.proxyBypass.localhost;
  instanceCountInput.value = appState.settings.instanceCount;
  

  // --- 7. LOGIKA TAB RUN & TOMBOL KONTROL UTAMA ---
  const startButton = document.getElementById('start-button');
  const pauseButton = document.getElementById('pause-button');
  const stopButton = document.getElementById('stop-button');
  const clearLogButton = document.getElementById('clear-log-button');
  const logAutoClear = document.getElementById('log-auto-clear');

  startButton.addEventListener('click', () => {
    // 1. Validasi
    if (appState.generalTargets.length === 0) {
      addLog('ERROR', 'Tidak ada target. Harap tambahkan URL di tab General.');
      showTab('general');
      return;
    }
    
    // 2. Kumpulkan settings
    gatherSettings();
    
    if (logAutoClear.checked) {
      logConsole.innerHTML = '';
    }
    
    startButton.classList.add('hidden');
    pauseButton.classList.remove('hidden');
    stopButton.classList.remove('hidden');
    
    runStatus.textContent = 'Running...';
    showTab('run');
    addLog('INFO', 'Starting traffic generation...');
    
    // 3. Kirim data
    // PERUBAHAN v27: Filter proxy yang 'enabled'
    const payload = {
      ...appState,
      // Kirim HANYA proxy yang 'enabled'
      geoProxies: appState.geoProxies.filter(p => p.enabled)
    };
    window.electronAPI.sendStartSignal(JSON.stringify(payload, null, 2));
  });

  stopButton.addEventListener('click', () => {
    startButton.classList.remove('hidden');
    pauseButton.classList.add('hidden');
    stopButton.classList.add('hidden');
    
    runStatus.textContent = 'Stopped.';
    addLog('WARN', 'Stopping traffic generation...');
    window.electronAPI.sendStopSignal();
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
    logConsole.innerHTML = '';
    addLog('INFO', 'Log cleared.');
  });

  window.electronAPI.onUpdateLog((value) => {
    addLog('BACKEND', value);
  });
  
  // --- INISIALISASI ---
  renderGeneralTable();
  renderProxyTable();
  renderPlatformTable();
  initializePlatformDropdowns(); // (v21)
  
}); // Akhir dari DOMContentLoaded