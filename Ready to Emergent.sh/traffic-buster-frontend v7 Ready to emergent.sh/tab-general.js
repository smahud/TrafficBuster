// --- FRONTEND ---
// File: tab-general.js

/*
  js/tab-general.js
  
  PERUBAHAN (Tugas 45):
  - 'renderGeneralTable' sekarang menampilkan format baru
    'flowDone/flowTarget | clickDone/clickTarget'.
*/

// --- 1. Import State & Fungsi Global ---
import { appState } from './app.js';
import { addLog, isValidDomainOrUrl, getHostname } from './utils.js';

// --- 2. Variabel & Data Lokal ---
const organicSources = {
  "Search Engine": ["Google", "Bing", "Yahoo", "Baidu", "DuckDuckGo"],
  "Referral": ["Facebook", "X (Twitter)", "Instagram", "YouTube", "Custom"]
};

// --- 3. Variabel DOM Modul ---
let urlInput, trafficTypeDirect, trafficTypeOrganic;
let organicOptionsContainer, organicSourceTypeSelect, organicSourceContentDiv;
let organicSourceContentSelect, organicSourceInputDiv, organicSourceInputLabel, organicSourceInput;
let addUrlButton, importUrlButton, importStatus, clearTableButton, resetStatsButton;
let urlTableBody;

// --- 4. Fungsi Helper Modul ---

/**
 * (TUGAS 45) Merender tabel target
 * - Menampilkan xxxx / yyyyy | aaa / bbb
 */
export function renderGeneralTable() {
  urlTableBody.innerHTML = '';
  if (appState.generalTargets.length === 0) {
     urlTableBody.innerHTML = `<tr><td colspan="8" class="table-cell text-center text-gray-500">No targets added.</td></tr>`;
     return;
  }
  appState.generalTargets.forEach((target, index) => {
    const row = document.createElement('tr');
    row.className = "hover:bg-gray-50";
    
    // Siapkan nilai untuk 'xxxx/yyyyy | aaa/bbb'
    const flowDone = target.flowDone || 0;
    const flowTarget = target.flowTarget || 'N/A';
    const clickDone = target.clickDone || 0;
    const clickTarget = target.clickTarget || 'N/A';
    
    row.innerHTML = `
      <td class="table-cell text-gray-600">${index + 1}</td>
      <td class="table-cell text-gray-900 truncate" style="max-width: 150px;" title="${target.url}">${target.url}</td>
      <td class="table-cell text-gray-600">${target.website}</td>
      <td class="table-cell text-gray-600">${target.type}</td>
      <td class="table-cell text-gray-600">${target.source}</td>
      <td class="table-cell text-gray-600">${target.keyword}</td>
      
      <td class="table-cell text-gray-600 font-medium whitespace-nowrap">
        ${flowDone}/${flowTarget} | ${clickDone}/${clickTarget}
      </td>
      
      <td class="table-cell text-right">
        <button data-index="${index}" class="text-red-600 hover:text-red-800 remove-btn-url table-remove-btn">Remove</button>
      </td>
    `;
    urlTableBody.appendChild(row);
  });
}

function resetOrganicOptions() {
  organicOptionsContainer.classList.add('hidden');
  organicSourceContentDiv.classList.add('hidden');
  organicSourceInputDiv.classList.add('hidden');
  organicSourceTypeSelect.value = "";
  organicSourceContentSelect.innerHTML = "";
  organicSourceInput.value = "";
}

function showCustomReferralInput() {
  organicSourceInputLabel.textContent = 'Custom Referral URL *';
  organicSourceInput.placeholder = 'my-blog.com';
  organicSourceInputDiv.classList.remove('hidden');
}

// --- 5. Fungsi Inisialisasi (DI-EXPORT) ---
export function initializeGeneralTab() {
  
  // --- A. Isi Variabel DOM ---
  urlInput = document.getElementById('url-input');
  trafficTypeDirect = document.getElementById('traffic-type-direct');
  trafficTypeOrganic = document.getElementById('traffic-type-organic');
  
  organicOptionsContainer = document.getElementById('organic-options-container');
  organicSourceTypeSelect = document.getElementById('organic-source-type');
  organicSourceContentDiv = document.getElementById('organic-source-content-div');
  organicSourceContentSelect = document.getElementById('organic-source-content');
  organicSourceInputDiv = document.getElementById('organic-source-input-div');
  organicSourceInputLabel = document.getElementById('organic-source-input-label');
  organicSourceInput = document.getElementById('organic-source-input');
  
  addUrlButton = document.getElementById('add-url-button');
  importUrlButton = document.getElementById('import-url-button');
  importStatus = document.getElementById('import-status');
  clearTableButton = document.getElementById('clear-table-button');
  resetStatsButton = document.getElementById('reset-stats-button');
  urlTableBody = document.getElementById('url-table-body');

  // --- B. Daftarkan Event Listener ---
  [trafficTypeDirect, trafficTypeOrganic].forEach(radio => {
    radio.addEventListener('change', () => {
      if (trafficTypeOrganic.checked) {
        organicOptionsContainer.classList.remove('hidden');
      } else {
        resetOrganicOptions();
      }
    });
  });

  organicSourceTypeSelect.addEventListener('change', () => {
    const selectedType = organicSourceTypeSelect.value;
    organicSourceContentSelect.innerHTML = "";
    organicSourceInputDiv.classList.add('hidden');
    
    if (selectedType && organicSources[selectedType]) {
      organicSourceContentSelect.innerHTML = '<option value="">-- Pilih Source --</option>';
      organicSources[selectedType].forEach(option => {
        const optEl = document.createElement('option');
        optEl.value = option;
        optEl.textContent = option;
        organicSourceContentSelect.appendChild(optEl);
      });
      
      organicSourceContentDiv.classList.remove('hidden');
      
      if (selectedType === 'Search Engine') {
        organicSourceInputLabel.textContent = 'Keywords * (dipisah koma)';
        organicSourceInput.placeholder = "Keyword1, Keyword2...";
        organicSourceInputDiv.classList.remove('hidden');
      }
      
      organicSourceContentSelect.value = "";
      
    } else {
      organicSourceContentDiv.classList.add('hidden');
    }
  });

  organicSourceContentSelect.addEventListener('change', () => {
    const selectedType = organicSourceTypeSelect.value;
    const selectedContent = organicSourceContentSelect.value;
    
    if (selectedType === 'Referral' && selectedContent === 'Custom') {
      showCustomReferralInput();
    } else if (selectedType === 'Referral') {
      organicSourceInputDiv.classList.add('hidden');
    }
  });

  // Tombol Add URL
  addUrlButton.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!isValidDomainOrUrl(url)) {
      addLog('ERROR', 'Invalid URL. Masukkan domain yang valid (mis: google.com)');
      importStatus.textContent = 'Error: URL tidak valid.';
      return;
    }
    
    const hostname = getHostname(url);
    const commonData = { 
      id: crypto.randomUUID(), 
      url: url, 
      website: hostname, 
      flowDone: 0,
      flowTarget: null,
      clickDone: 0,   // ** BARU (Tugas 45) **
      clickTarget: null // ** BARU (Tugas 45) **
    };

    if (trafficTypeDirect.checked) {
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
        const keywords = inputValue.split(',').map(k => k.trim()).filter(k => k);
        
        if (keywords.length > 0) {
          keywords.forEach(kw => {
            appState.generalTargets.push({
              ...commonData,
              id: crypto.randomUUID(), 
              type: 'Organic',
              source: sourceContent,
              keyword: kw,
            });
          });
          importStatus.textContent = `Added ${keywords.length} keyword(s) for ${url}.`;
        } else {
          addLog('ERROR', 'Harap masukkan setidaknya satu keyword.');
          importStatus.textContent = 'Error: Harap masukkan keyword.';
          return;
        }
        
      } else { // 'Referral'
        let source;
        if (sourceContent === 'Custom') {
          if (!isValidDomainOrUrl(inputValue)) {
             addLog('ERROR', 'Custom Referral URL tidak valid.');
             importStatus.textContent = 'Error: Custom Referral URL tidak valid.';
             return;
          }
          source = getHostname(inputValue);
        } else {
          source = sourceContent;
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
    resetOrganicOptions();
    trafficTypeDirect.checked = true;
    addLog('INFO', 'Target ditambahkan ke list.');
  });
  
  urlTableBody.addEventListener('click', e => {
    if (e.target.classList.contains('remove-btn-url')) {
      appState.generalTargets.splice(e.target.dataset.index, 1);
      renderGeneralTable();
    }
  });

  clearTableButton.addEventListener('click', () => {
    appState.generalTargets = [];
    renderGeneralTable();
  });

  resetStatsButton.addEventListener('click', () => {
    appState.generalTargets.forEach(target => {
      target.flowDone = 0;
      target.flowTarget = null;
      target.clickDone = 0;   // ** BARU (Tugas 45) **
      target.clickTarget = null; // ** BARU (Tugas 45) **
    });
    renderGeneralTable();
    addLog('INFO', 'Statistik "Flow" dan "Click" telah di-reset.');
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
          id: crypto.randomUUID(), 
          url: url,
          website: hostname,
          type: 'Direct',
          source: 'N/A',
          keyword: 'N/A',
          flowDone: 0,
          flowTarget: null,
          clickDone: 0,   // ** BARU (Tugas 45) **
          clickTarget: null // ** BARU (Tugas 45) **
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

  // --- C. Panggilan Awal ---
  renderGeneralTable();
}