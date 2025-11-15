/*
  tab-geolocation.js
  Lokasi: root directory frontend beserta index.html
  FULL CODE + PATCH proxy failover real-time
  Credit: smahud
*/

// PATCH: Proxy failover sync event listener dari backend (real-time mark ON/OFF)
window.addEventListener('backend-ws-message', (evt) => {
  const data = evt.detail;
  if (data && data.type === 'proxyStatusUpdate') {
    const px = appState.geoProxies.find(
      p => (data.proxyId && p.id === data.proxyId) || (data.host && p.host === data.host)
    );
    if (px) {
      px.enabled = data.enabled;
      addLog('WARN', `Proxy ${px.host} di-mark ${data.enabled ? 'ON' : 'OFF'} otomatis oleh backend/job.`);
      renderProxyTable();
    }
  }
});

// --- 1. Import State & Fungsi Global ---
import { appState } from './app.js';
import { addLog } from './utils.js';

// --- 2. Variabel DOM Modul ---
let proxyTableBody;
let addProxyButton;
let testProxyBeforeAddCheckbox;
let proxyTestStatus;
let testTimeoutSlider, testTimeoutLabel;
let enableProxyCheckbox, bypassLocalhost, bypassCustom, bypassCustomList;

// --- 3. Helper untuk merender dan handle proxy table ---
export function renderProxyTable() {
  proxyTableBody.innerHTML = '';
  if (appState.geoProxies.length === 0) {
    proxyTableBody.innerHTML = `<tr><td colspan="8" class="table-cell text-center text-gray-500">No proxies added.</td></tr>`;
    return;
  }
  const allowProxyTest = appState.features?.allowProxies || false;
  appState.geoProxies.forEach((proxy, index) => {
    const row = document.createElement('tr');
    row.className = "hover:bg-gray-50";
    let credentialText = 'N/A';
    if (proxy.user && proxy.pass) {
      credentialText = `${proxy.user}:${proxy.pass}`;
    } else if (proxy.user) {
      credentialText = proxy.user;
    }
    const proxyId = `proxy-status-${index}`;
    const testButtonHtml = allowProxyTest
      ? `<button data-index="${index}" class="btn btn-icon text-xs ml-1 test-btn-proxy" title="Test proxy connectivity">
           <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
           </svg>
         </button>`
      : `<button disabled class="btn btn-icon text-xs ml-1 opacity-50 cursor-not-allowed" title="Feature locked (Free license)">
           <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
           </svg>
         </button>`;
    row.innerHTML = `
      <td class="table-cell text-gray-600">${index + 1}</td>
      <td class="table-cell text-gray-900 font-medium">${proxy.protocol || 'N/A'}</td>
      <td class="table-cell text-gray-900 truncate" style="max-width: 150px;" title="${proxy.host}">${proxy.host}</td>
      <td class="table-cell text-gray-600 truncate" style="max-width: 100px;" title="${credentialText}">${credentialText}</td>
      <td class="table-cell text-gray-600">${proxy.speed ? `${proxy.speed} ms` : 'N/A'}</td>
      <td class="table-cell text-gray-600">${proxy.country || 'N/A'}</td>
      <td class="table-cell">
        <span id="test-status-${index}" class="text-xs text-gray-500"></span>
      </td>
      <td class="table-cell text-right">
        <div class="flex items-center justify-end space-x-2">
          <div class="flex items-center space-x-1 text-xs">
            <input type="radio" id="${proxyId}-on" name="${proxyId}" value="on" class="form-radio proxy-status-toggle" data-index="${index}" ${proxy.enabled ? 'checked' : ''}>
            <label for="${proxyId}-on" class="cursor-pointer">On</label>
            <input type="radio" id="${proxyId}-off" name="${proxyId}" value="off" class="form-radio proxy-status-toggle" data-index="${index}" ${!proxy.enabled ? 'checked' : ''}>
            <label for="${proxyId}-off" class="cursor-pointer">Off</label>
          </div>
          ${testButtonHtml}
          <button data-index="${index}" class="text-red-600 hover:text-red-800 remove-btn-proxy table-remove-btn ml-2">Remove</button>
        </div>
      </td>
    `;
    proxyTableBody.appendChild(row);
  });
}

// --- 4. Validasi Max Proxies berdasarkan fitur lisensi ---
function validateMaxProxies(newProxiesCount = 1) {
  if (!appState.features || !appState.features.maxProxies) {
    return true;
  }
  const currentCount = appState.geoProxies.length;
  const maxAllowed = appState.features.maxProxies;
  if (maxAllowed === 9999) {
    return true;
  }
  if (currentCount + newProxiesCount > maxAllowed) {
    const remaining = maxAllowed - currentCount;
    addLog('ERROR', `Limit maksimal proxy untuk lisensi '${appState.features.license}' adalah ${maxAllowed}. Saat ini: ${currentCount} proxies.`);
    if (remaining > 0) {
      alert(`Anda hanya bisa menambahkan ${remaining} proxy lagi.\nLimit: ${maxAllowed}`);
    } else {
      alert(`Limit maksimal proxy tercapai!`);
    }
    return false;
  }
  return true;
}

// --- 5. Fungsi untuk menambah proxy dengan atau tanpa tes ---
async function addProxy(proxyConfig) {
  if (!testProxyBeforeAddCheckbox.checked) {
    appState.geoProxies.push({ ...proxyConfig, enabled: true, protocol: 'N/A' });
    renderProxyTable();
    return true;
  }
  proxyTestStatus.textContent = `Testing ${proxyConfig.host}...`;
  addProxyButton.disabled = true;
  const timeout = parseInt(testTimeoutSlider.value, 10) || 1000;
  const result = await window.electronAPI.testProxy(proxyConfig, timeout);
  if (result.success) {
    appState.geoProxies.push({
      ...proxyConfig,
      speed: result.speed,
      country: result.country,
      protocol: result.protocol,
      enabled: true
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

// --- 6. Test single proxy dari tabel (API BE) ---
async function testSingleProxy(index) {
  const proxy = appState.geoProxies[index];
  if (!proxy) return;
  const statusSpan = document.getElementById(`test-status-${index}`);
  const testBtn = document.querySelector(`.test-btn-proxy[data-index="${index}"]`);
  if (!statusSpan || !testBtn) return;
  statusSpan.textContent = 'Testing...';
  statusSpan.className = 'text-xs text-blue-600';
  testBtn.disabled = true;
  testBtn.classList.add('opacity-50');
  try {
    const token = localStorage.getItem('trafficBusterToken');
    if (!token) throw new Error('No auth token');
    const timeout = parseInt(testTimeoutSlider.value, 10) || 10000;
    const response = await fetch(`https://${appState.backendHost}/api/v1/data/proxy/test`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: proxy.host,
        port: proxy.host.split(':')[1] || '80',
        username: proxy.user || undefined,
        password: proxy.pass || undefined,
        timeout: timeout
      })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }
    const result = await response.json();
    if (result.success) {
      appState.geoProxies[index] = {
        ...proxy,
        speed: result.speed,
        protocol: result.protocol,
        country: result.country || 'Unknown'
      };
      statusSpan.textContent = `✓ ${result.speed}ms`;
      statusSpan.className = 'text-xs text-green-600';
      addLog('SUCCESS', `Proxy test passed: ${proxy.host} (${result.speed}ms, ${result.protocol})`);
      renderProxyTable();
    } else {
      statusSpan.textContent = `✗ ${result.error || 'Failed'}`;
      statusSpan.className = 'text-xs text-red-600';
      addLog('ERROR', `Proxy test failed: ${proxy.host} - ${result.error}`);
    }
  } catch (error) {
    statusSpan.textContent = `✗ ${error.message}`;
    statusSpan.className = 'text-xs text-red-600';
    addLog('ERROR', `Proxy test error: ${proxy.host} - ${error.message}`);
  } finally {
    testBtn.disabled = false;
    testBtn.classList.remove('opacity-50');
  }
}

// --- 7. Load all settings ke UI ---
function loadStateIntoUI() {
  enableProxyCheckbox.checked = appState.settings.useProxy;
  testTimeoutSlider.value = appState.settings.proxyTestTimeout;
  testTimeoutLabel.textContent = appState.settings.proxyTestTimeout;
  bypassLocalhost.checked = appState.settings.proxyBypass.localhost;
  bypassCustom.checked = appState.settings.proxyBypass.custom;
  bypassCustomList.value = appState.settings.proxyBypass.customList;
  bypassCustomList.classList.toggle('hidden', !appState.settings.proxyBypass.custom);
}

// --- 8. INISIALISASI MODUL UTAMA ---
export function initializeGeoTab() {
  // --- DOM Assignment ---
  const proxyFileInput = document.getElementById('proxy-file-input');
  const importProxyFileButton = document.getElementById('import-proxy-file-button');
  const proxyHostInput = document.getElementById('proxy-host');
  const proxyUserInput = document.getElementById('proxy-user');
  const proxyPassInput = document.getElementById('proxy-pass');
  const clearProxyButton = document.getElementById('clear-proxy-button');
  testProxyBeforeAddCheckbox = document.getElementById('test-proxy-before-add-checkbox');
  proxyTestStatus = document.getElementById('proxy-test-status');
  addProxyButton = document.getElementById('add-proxy-button');
  proxyTableBody = document.getElementById('proxy-table-body');
  testTimeoutSlider = document.getElementById('test-timeout-slider');
  testTimeoutLabel = document.getElementById('test-timeout-label');
  enableProxyCheckbox = document.getElementById('enable-proxy-checkbox');
  bypassLocalhost = document.getElementById('bypass-localhost');
  bypassCustom = document.getElementById('bypass-custom');
  bypassCustomList = document.getElementById('bypass-custom-list');

  // --- Event Listeners ---
  enableProxyCheckbox.addEventListener('change', () => {
    appState.settings.useProxy = enableProxyCheckbox.checked;
  });
  testTimeoutSlider.addEventListener('input', () => {
    const timeout = parseInt(testTimeoutSlider.value, 10);
    testTimeoutLabel.textContent = timeout;
    appState.settings.proxyTestTimeout = timeout;
  });
  bypassLocalhost.addEventListener('change', () => {
    appState.settings.proxyBypass.localhost = bypassLocalhost.checked;
  });
  bypassCustom.addEventListener('change', () => {
    const isChecked = bypassCustom.checked;
    appState.settings.proxyBypass.custom = isChecked;
    bypassCustomList.classList.toggle('hidden', !isChecked);
  });
  bypassCustomList.addEventListener('input', () => {
    appState.settings.proxyBypass.customList = bypassCustomList.value;
  });

  addProxyButton.addEventListener('click', async () => {
    const host = proxyHostInput.value.trim();
    const user = proxyUserInput.value.trim();
    const pass = proxyPassInput.value.trim();
    if (!host) return;
    if (!validateMaxProxies(1)) return;
    const success = await addProxy({ host, user: user || null, pass: pass || null });
    if (success) {
      proxyHostInput.value = '';
      proxyUserInput.value = '';
      proxyPassInput.value = '';
    }
  });

  proxyTableBody.addEventListener('click', e => {
    // Remove
    if (e.target.classList.contains('remove-btn-proxy')) {
      appState.geoProxies.splice(e.target.dataset.index, 1);
      renderProxyTable();
      return;
    }
    // TEST BUTTON
    if (e.target.closest('.test-btn-proxy')) {
      const btn = e.target.closest('.test-btn-proxy');
      const index = parseInt(btn.dataset.index, 10);
      testSingleProxy(index);
      return;
    }
  });

  proxyTableBody.addEventListener('change', e => {
    if (e.target.classList.contains('proxy-status-toggle')) {
      const index = e.target.dataset.index;
      const isEnabled = (e.target.value === 'on');
      appState.geoProxies[index].enabled = isEnabled;
    }
  });

  clearProxyButton.addEventListener('click', () => {
    appState.geoProxies = [];
    renderProxyTable();
  });

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
        if (parts.length === 2) {
          proxy = { host: `${parts[0]}:${parts[1]}`, user: null, pass: null };
        } else if (parts.length === 4) {
          proxy = { host: `${parts[0]}:${parts[1]}`, user: parts[2], pass: parts[3] };
        }
        if (proxy.host) {
          parsedProxies.push(proxy);
        }
      });
      if (!validateMaxProxies(parsedProxies.length)) {
        proxyTestStatus.textContent = `Import dibatalkan: Limit tercapai.`;
        return;
      }
      if (!testProxyBeforeAddCheckbox.checked) {
        parsedProxies.forEach(p => { p.enabled = true; p.protocol = 'N/A'; });
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
          const success = await addProxy(proxy);
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

  // --- Load state awal & render table ---
  loadStateIntoUI();
  renderProxyTable();
}