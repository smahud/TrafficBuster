/*
  tab-settings.js
  
  PERBAIKAN (License Gating UI):
  - Tambah validasi instance count real-time (Free & Premium: max 1)
  - Tambah overlay pada Human Surfing card untuk Free user
  - Hapus overlay untuk Premium/Enterprise user
*/

// --- 1. Import State & Fungsi Global ---
import { appState } from './app.js';
import { addLog } from './utils.js';

// --- 2. Variabel DOM Modul ---
let instanceCountInput, trafficModeRadios;
let sessionDurationRadios, sessionConstantValue, sessionVariableMin, sessionVariableMax, sessionDurationConstantDiv, sessionDurationVariableDiv;
let platformSwitchRadios;
let trafficDelayRadios, trafficDelayConstantValue, trafficDelayVariableMin, trafficDelayVariableMax, trafficDelayConstantDiv, trafficDelayVariableDiv;
let pageTrafficTotal, pageTrafficAvg, pageTrafficRadios, pageTrafficTotalValue, pageTrafficAvgOptions, pageTrafficAvgMin, pageTrafficAvgMax;
let dnsRadios, dnsCustomInput;
let proxySwitchRadios, proxySwitchTimeValue, proxySwitchRandom;
let humanAutoScroll, humanAutoScrollOptions, humanSurfingTimeRadios, humanSurfingTimeConstant, humanSurfingTimeVariable, humanSurfingTimeMin, humanSurfingTimeMax;
let humanAutoClick, humanAutoClickOptions, humanInternalClick, humanInternalClickOptions, humanInternalClickValue;
let humanExternalClick, humanExternalClickOptions, humanExternalClickValue, humanInteractionDepth, humanInteractionDepthDiv;
let humanSurfingCard;

// --- 3. Database Preset ---
const PRESET_TEMPLATES = {
  'Default': {},
  'Max sessions': {
    sessionDuration: { type: 'Variable', min: 20000, max: 60000 },
    trafficDelay: { type: 'Constant', value: 1000 },
    humanSurfing: { interactionDepth: 1 }
  },
  'Max pageviews': {
    sessionDuration: { type: 'Variable', min: 180000, max: 300000 },
    humanSurfing: { 
      interactionDepth: 5, autoPageScrolling: true, autoClickRatio: true,
      internalClick: { enabled: true, value: 50 }
    }
  },
  'Max bounce rate': {
    sessionDuration: { type: 'Variable', min: 3000, max: 10000 },
    humanSurfing: { interactionDepth: 0, autoPageScrolling: false, autoClickRatio: false }
  },
  'Min bounce rate': {
    sessionDuration: { type: 'Variable', min: 180000, max: 300000 },
    humanSurfing: { 
      interactionDepth: 5, autoPageScrolling: true, autoClickRatio: true,
      internalClick: { enabled: true, value: 50 }
    }
  }
};

// --- 4. Fungsi Helper Modul ---

function applyPreset(mode) {
  const preset = PRESET_TEMPLATES[mode];
  if (!preset) return;
  addLog('INFO', `Menerapkan preset: ${mode}`);
  
  if (preset.sessionDuration) {
    appState.settings.sessionDuration = { ...appState.settings.sessionDuration, ...preset.sessionDuration };
  }
  if (preset.trafficDelay) {
    appState.settings.trafficDelay = { ...appState.settings.trafficDelay, ...preset.trafficDelay };
  }
  if (preset.humanSurfing) {
    appState.settings.humanSurfing = {
      ...appState.settings.humanSurfing, ...preset.humanSurfing,
      internalClick: {
        ...appState.settings.humanSurfing.internalClick,
        ...(preset.humanSurfing.internalClick || {})
      }
    };
  }
  updateSettingsUIFromState();
}

function updateSettingsUIFromState() {
  const s = appState.settings;
  instanceCountInput.value = s.instanceCount;
  document.querySelector(`input[name="traffic-mode"][value="${s.trafficMode}"]`).checked = true;
  document.querySelector(`input[name="session-duration"][value="${s.sessionDuration.type}"]`).checked = true;
  document.querySelector(`input[name="platform-switch"][value="${s.platformSwitch}"]`).checked = true;
  document.querySelector(`input[name="traffic-delay"][value="${s.trafficDelay.type}"]`).checked = true;
  document.querySelector(`input[name="page-traffic"][value="${s.pageTraffic.type}"]`).checked = true;
  document.querySelector(`input[name="page-order"][value="${s.pageOrder}"]`).checked = true;
  document.querySelector(`input[name="dns-config"][value="${s.dnsConfig.type}"]`).checked = true;
  document.querySelector(`input[name="proxy-switch"][value="${s.proxySwitch.type}"]`).checked = true;
  document.querySelector(`input[name="surfing-time-type"][value="${s.humanSurfing.surfingTime.type}"]`).checked = true;
  sessionConstantValue.value = s.sessionDuration.value || 2000;
  sessionVariableMin.value = s.sessionDuration.min || 4000;
  sessionVariableMax.value = s.sessionDuration.max || 4000;
  trafficDelayConstantValue.value = s.trafficDelay.value || 1000;
  trafficDelayVariableMin.value = s.trafficDelay.min || 1000;
  trafficDelayVariableMax.value = s.trafficDelay.max || 3000;
  pageTrafficTotalValue.value = s.pageTraffic.value || 10;
  pageTrafficAvgMin.value = s.pageTraffic.min || 1;
  pageTrafficAvgMax.value = s.pageTraffic.max || 5;
  dnsCustomInput.value = s.dnsConfig.custom;
  proxySwitchRandom.checked = s.proxySwitch.random;
  proxySwitchTimeValue.value = s.proxySwitch.timeValue || 300000;
  humanAutoScroll.checked = s.humanSurfing.autoPageScrolling;
  humanSurfingTimeConstant.value = s.humanSurfing.surfingTime.value || 1500;
  humanSurfingTimeMin.value = s.humanSurfing.surfingTime.min || 1000;
  humanSurfingTimeMax.value = s.humanSurfing.surfingTime.max || 3000;
  humanAutoClick.checked = s.humanSurfing.autoClickRatio;
  humanInternalClick.checked = s.humanSurfing.internalClick.enabled;
  humanInternalClickValue.value = s.humanSurfing.internalClick.value || 10;
  humanExternalClick.checked = s.humanSurfing.externalClick.enabled;
  humanExternalClickValue.value = s.humanSurfing.externalClick.value || 1;
  humanInteractionDepth.value = s.humanSurfing.interactionDepth;
  pageTrafficTotalValue.classList.toggle('hidden', s.pageTraffic.type !== 'Total');
  pageTrafficAvgOptions.classList.toggle('hidden', s.pageTraffic.type !== 'Avg');
  dnsCustomInput.classList.toggle('hidden', s.dnsConfig.type !== 'Custom');
  proxySwitchTimeValue.classList.toggle('hidden', s.proxySwitch.type !== 'Time');
  humanAutoScrollOptions.classList.toggle('hidden', !s.humanSurfing.autoPageScrolling);
  humanSurfingTimeConstant.classList.toggle('hidden', s.humanSurfing.surfingTime.type !== 'Constant');
  humanSurfingTimeVariable.classList.toggle('hidden', s.humanSurfing.surfingTime.type !== 'Variable');
  humanAutoClickOptions.classList.toggle('hidden', !s.humanSurfing.autoClickRatio);
  humanInternalClickOptions.classList.toggle('hidden', !s.humanSurfing.internalClick.enabled);
  humanExternalClickOptions.classList.toggle('hidden', !s.humanSurfing.externalClick.enabled);
  humanInteractionDepthDiv.classList.toggle('hidden', !s.humanSurfing.autoClickRatio);
  sessionDurationConstantDiv.classList.toggle('hidden', s.sessionDuration.type !== 'Constant');
  sessionDurationVariableDiv.classList.toggle('hidden', s.sessionDuration.type !== 'Variable');
  trafficDelayConstantDiv.classList.toggle('hidden', s.trafficDelay.type !== 'Constant');
  trafficDelayVariableDiv.classList.toggle('hidden', s.trafficDelay.type !== 'Variable');
}

// ** BARU: Validasi Instance Count **
function validateInstanceCount() {
  if (!appState.features || !appState.features.maxInstances) {
    return;
  }
  
  const currentValue = parseInt(instanceCountInput.value, 10) || 1;
  const maxAllowed = appState.features.maxInstances;
  
  if (maxAllowed !== 9999 && currentValue > maxAllowed) {
    addLog('WARN', `Instance count dikembalikan ke ${maxAllowed} (limit untuk lisensi '${appState.features.license}').`);
    alert(`Limit maksimal instance untuk lisensi '${appState.features.license}' adalah ${maxAllowed}.\n\nNilai dikembalikan ke ${maxAllowed}.`);
    instanceCountInput.value = maxAllowed;
    appState.settings.instanceCount = maxAllowed;
  }
}

// ** BARU: Apply Overlay untuk Human Surfing Card **
function applyHumanSurfingOverlay() {
  if (!appState.features) return;
  
  if (!humanSurfingCard) return;
  
  // Hapus overlay lama jika ada
  const oldOverlay = humanSurfingCard.querySelector('.card-overlay');
  if (oldOverlay) oldOverlay.remove();
  
  // Hanya apply overlay untuk Free (allowHumanSurfing = false)
  if (!appState.features.allowHumanSurfing) {
    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';
    overlay.innerHTML = `
      <div class="overlay-content">
        <svg class="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
        </svg>
        <p class="text-sm font-semibold text-gray-700">Fitur Terkunci</p>
        <p class="text-xs text-gray-500 mt-1">Human Surfing tidak tersedia<br>untuk lisensi '${appState.features.license}'</p>
      </div>
    `;
    humanSurfingCard.style.position = 'relative';
    humanSurfingCard.appendChild(overlay);
  }
}

// --- 5. Fungsi Inisialisasi (DI-EXPORT) ---
export function initializeSettingsTab() {

  // --- A. Isi Variabel DOM ---
  instanceCountInput = document.getElementById('instance-count');
  trafficModeRadios = document.querySelectorAll('input[name="traffic-mode"]');
  sessionDurationRadios = document.querySelectorAll('input[name="session-duration"]');
  sessionConstantValue = document.getElementById('session-duration-constant-value');
  sessionVariableMin = document.getElementById('session-duration-variable-min');
  sessionVariableMax = document.getElementById('session-duration-variable-max');
  sessionDurationConstantDiv = document.getElementById('session-duration-constant-div');
  sessionDurationVariableDiv = document.getElementById('session-duration-variable-div');
  platformSwitchRadios = document.querySelectorAll('input[name="platform-switch"]');
  trafficDelayRadios = document.querySelectorAll('input[name="traffic-delay"]');
  trafficDelayConstantValue = document.getElementById('traffic-delay-constant-value');
  trafficDelayVariableMin = document.getElementById('traffic-delay-variable-min');
  trafficDelayVariableMax = document.getElementById('traffic-delay-variable-max');
  trafficDelayConstantDiv = document.getElementById('traffic-delay-constant-div');
  trafficDelayVariableDiv = document.getElementById('traffic-delay-variable-div');
  pageTrafficTotal = document.getElementById('page-traffic-total');
  pageTrafficAvg = document.getElementById('page-traffic-avg');
  pageTrafficRadios = document.querySelectorAll('input[name="page-traffic"]');
  pageTrafficTotalValue = document.getElementById('page-traffic-total-value');
  pageTrafficAvgOptions = document.getElementById('page-traffic-avg-options');
  pageTrafficAvgMin = document.getElementById('page-traffic-avg-min');
  pageTrafficAvgMax = document.getElementById('page-traffic-avg-max');
  dnsRadios = document.querySelectorAll('input[name="dns-config"]');
  dnsCustomInput = document.getElementById('dns-custom-input');
  proxySwitchRadios = document.querySelectorAll('input[name="proxy-switch"]');
  proxySwitchTimeValue = document.getElementById('proxy-switch-time-value');
  proxySwitchRandom = document.getElementById('proxy-switch-random');
  humanAutoScroll = document.getElementById('human-auto-scroll');
  humanAutoScrollOptions = document.getElementById('human-auto-scroll-options');
  humanSurfingTimeRadios = document.querySelectorAll('input[name="surfing-time-type"]');
  humanSurfingTimeConstant = document.getElementById('human-surfing-time-constant');
  humanSurfingTimeVariable = document.getElementById('human-surfing-time-variable');
  humanSurfingTimeMin = document.getElementById('human-surfing-time-min');
  humanSurfingTimeMax = document.getElementById('human-surfing-time-max');
  humanAutoClick = document.getElementById('human-auto-click');
  humanAutoClickOptions = document.getElementById('human-auto-click-options');
  humanInternalClick = document.getElementById('human-internal-click');
  humanInternalClickOptions = document.getElementById('human-internal-click-options');
  humanInternalClickValue = document.getElementById('human-internal-click-value');
  humanExternalClick = document.getElementById('human-external-click');
  humanExternalClickOptions = document.getElementById('human-external-click-options');
  humanExternalClickValue = document.getElementById('human-external-click-value');
  humanInteractionDepth = document.getElementById('human-interaction-depth');
  humanInteractionDepthDiv = document.getElementById('human-interaction-depth-div');
  
  // ** BARU: Ambil card Human Surfing untuk overlay **
  humanSurfingCard = document.querySelector('#human-auto-scroll')?.closest('.content-card');

  // --- B. Daftarkan Event Listener ---
  
  // ** BARU: Validasi maxInstances saat input berubah **
  instanceCountInput.addEventListener('input', () => { 
    appState.settings.instanceCount = parseInt(instanceCountInput.value, 10) || 1;
  });
  
  // ** BARU: Validasi saat blur (keluar dari input) **
  instanceCountInput.addEventListener('blur', validateInstanceCount);
  
  proxySwitchRandom.addEventListener('change', () => { appState.settings.proxySwitch.random = proxySwitchRandom.checked; });
  humanAutoScroll.addEventListener('change', () => { appState.settings.humanSurfing.autoPageScrolling = humanAutoScroll.checked; humanAutoScrollOptions.classList.toggle('hidden', !humanAutoScroll.checked); });
  humanAutoClick.addEventListener('change', () => { 
    const isChecked = humanAutoClick.checked;
    appState.settings.humanSurfing.autoClickRatio = isChecked; 
    humanAutoClickOptions.classList.toggle('hidden', !isChecked);
    humanInteractionDepthDiv.classList.toggle('hidden', !isChecked);
  });
  humanInternalClick.addEventListener('change', () => { appState.settings.humanSurfing.internalClick.enabled = humanInternalClick.checked; humanInternalClickOptions.classList.toggle('hidden', !humanInternalClick.checked); });
  humanExternalClick.addEventListener('change', () => { appState.settings.humanSurfing.externalClick.enabled = humanExternalClick.checked; humanExternalClickOptions.classList.toggle('hidden', !humanExternalClick.checked); });
  humanInteractionDepth.addEventListener('input', () => { appState.settings.humanSurfing.interactionDepth = parseInt(humanInteractionDepth.value, 10) || 0; });
  humanInternalClickValue.addEventListener('input', () => { appState.settings.humanSurfing.internalClick.value = parseInt(humanInternalClickValue.value, 10) || 0; });
  humanExternalClickValue.addEventListener('input', () => { appState.settings.humanSurfing.externalClick.value = parseInt(humanExternalClickValue.value, 10) || 0; });
  trafficModeRadios.forEach(radio => radio.addEventListener('change', (e) => { 
    appState.settings.trafficMode = e.target.value;
    if (e.target.value !== 'Default') {
      applyPreset(e.target.value);
    }
  }));
  platformSwitchRadios.forEach(radio => radio.addEventListener('change', (e) => { appState.settings.platformSwitch = e.target.value; }));
  document.querySelectorAll('input[name="page-order"]').forEach(radio => radio.addEventListener('change', (e) => { appState.settings.pageOrder = e.target.value; }));
  sessionDurationRadios.forEach(radio => radio.addEventListener('change', (e) => { 
    appState.settings.sessionDuration.type = e.target.value; 
    sessionDurationConstantDiv.classList.toggle('hidden', e.target.value !== 'Constant');
    sessionDurationVariableDiv.classList.toggle('hidden', e.target.value !== 'Variable');
  }));
  sessionConstantValue.addEventListener('input', () => { appState.settings.sessionDuration.value = parseInt(sessionConstantValue.value, 10); });
  sessionVariableMin.addEventListener('input', () => { appState.settings.sessionDuration.min = parseInt(sessionVariableMin.value, 10); });
  sessionVariableMax.addEventListener('input', () => { appState.settings.sessionDuration.max = parseInt(sessionVariableMax.value, 10); });
  trafficDelayRadios.forEach(radio => radio.addEventListener('change', (e) => { 
    appState.settings.trafficDelay.type = e.target.value; 
    trafficDelayConstantDiv.classList.toggle('hidden', e.target.value !== 'Constant');
    trafficDelayVariableDiv.classList.toggle('hidden', e.target.value !== 'Variable');
  }));
  trafficDelayConstantValue.addEventListener('input', () => { appState.settings.trafficDelay.value = parseInt(trafficDelayConstantValue.value, 10); });
  trafficDelayVariableMin.addEventListener('input', () => { appState.settings.trafficDelay.min = parseInt(trafficDelayVariableMin.value, 10); });
  trafficDelayVariableMax.addEventListener('input', () => { appState.settings.trafficDelay.max = parseInt(trafficDelayVariableMax.value, 10); });
  pageTrafficRadios.forEach(radio => radio.addEventListener('change', (e) => { 
    appState.settings.pageTraffic.type = e.target.value; 
    pageTrafficTotalValue.classList.toggle('hidden', e.target.value !== 'Total');
    pageTrafficAvgOptions.classList.toggle('hidden', e.target.value !== 'Avg');
  }));
  pageTrafficTotalValue.addEventListener('input', () => { appState.settings.pageTraffic.value = parseInt(pageTrafficTotalValue.value, 10); });
  pageTrafficAvgMin.addEventListener('input', () => { appState.settings.pageTraffic.min = parseInt(pageTrafficAvgMin.value, 10); });
  pageTrafficAvgMax.addEventListener('input', () => { appState.settings.pageTraffic.max = parseInt(pageTrafficAvgMax.value, 10); });
  dnsRadios.forEach(radio => radio.addEventListener('change', (e) => {
    appState.settings.dnsConfig.type = e.target.value;
    dnsCustomInput.classList.toggle('hidden', e.target.value !== 'Custom');
  }));
  dnsCustomInput.addEventListener('input', () => { appState.settings.dnsConfig.custom = dnsCustomInput.value; });
  proxySwitchRadios.forEach(radio => radio.addEventListener('change', (e) => {
    appState.settings.proxySwitch.type = e.target.value;
    proxySwitchTimeValue.classList.toggle('hidden', e.target.value !== 'Time');
  }));
  proxySwitchTimeValue.addEventListener('input', () => { appState.settings.proxySwitch.timeValue = parseInt(proxySwitchTimeValue.value, 10); });
  humanSurfingTimeRadios.forEach(radio => radio.addEventListener('change', (e) => {
    appState.settings.humanSurfing.surfingTime.type = e.target.value;
    humanSurfingTimeConstant.classList.toggle('hidden', e.target.value !== 'Constant');
    humanSurfingTimeVariable.classList.toggle('hidden', e.target.value !== 'Variable');
  }));
  humanSurfingTimeConstant.addEventListener('input', () => { appState.settings.humanSurfing.surfingTime.value = parseInt(humanSurfingTimeConstant.value, 10); });
  humanSurfingTimeMin.addEventListener('input', () => { appState.settings.humanSurfing.surfingTime.min = parseInt(humanSurfingTimeMin.value, 10); });
  humanSurfingTimeMax.addEventListener('input', () => { appState.settings.humanSurfing.surfingTime.max = parseInt(humanSurfingTimeMax.value, 10); });
  
  // --- C. Panggilan Awal ---
  updateSettingsUIFromState();
  validateInstanceCount(); // ** BARU: Validasi saat load **
  applyHumanSurfingOverlay(); // ** BARU: Apply overlay jika Free **
}