/**
 * FRONTEND - tab-scheduler.js (UPDATED - Old Style + History)
 * Credit: smahud - 2025-11-14 21:44:00 UTC
 * 
 * CHANGES:
 * - Use old form fields (name, occurrence, startAt)
 * - Remove target/settings dropdowns
 * - Add history table display
 * - Match old file structure
 */

import { appState } from './app.js';
import { addLog } from './utils.js';

let schedules = [];

/**
 * Initialize Scheduler Tab
 */
export function initializeSchedulerTab() {
  console.log('[tab-scheduler] Initializing...');
  
  // Load schedules from appState
  schedules = appState.schedules || [];
  
  // Render lists
  renderScheduleList();
  renderHistoryList();
  
  // Setup event listeners
  setupEventListeners();
  
  console.log('[tab-scheduler] Initialized successfully');
}

/**
 * Setup event listeners (with null checks)
 */
function setupEventListeners() {
  // Schedule form submit
  const scheduleForm = document.getElementById('scheduler-form');
  if (scheduleForm) {
    scheduleForm.addEventListener('submit', handleScheduleSubmit);
  } else {
    console.warn('[tab-scheduler] scheduler-form not found');
  }
  
  // Clear all schedules button
  const clearScheduleBtn = document.getElementById('clear-schedule-button');
  if (clearScheduleBtn) {
    clearScheduleBtn.addEventListener('click', handleClearAllSchedules);
  } else {
    console.warn('[tab-scheduler] clear-schedule-button not found');
  }
  
  // History clear button
  const historyClearBtn = document.getElementById('history-clear-btn');
  if (historyClearBtn) {
    historyClearBtn.addEventListener('click', handleHistoryClear);
  } else {
    console.warn('[tab-scheduler] history-clear-btn not found');
  }
  
  // Listen for history updates
  window.addEventListener('history-updated', () => {
    console.log('[tab-scheduler] History updated, re-rendering...');
    renderHistoryList();
  });
}

/**
 * Handle schedule form submit
 */
async function handleScheduleSubmit(event) {
  event.preventDefault();
  
  const name = document.getElementById('schedule-name')?.value;
  const occurrence = document.getElementById('schedule-occurrence')?.value;
  const startAt = document.getElementById('schedule-start-at')?.value;
  
  if (!name || !occurrence || !startAt) {
    addLog('ERROR', 'Semua field harus diisi');
    return;
  }
  
  const newSchedule = {
    id: `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    occurrence,
    startAt,
    status: 'active',
    createdAt: new Date().toISOString()
  };
  
  try {
    // Send to backend
    const response = await fetch(`https://${appState.backendHost}/api/v1/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('trafficBusterToken')}`
      },
      body: JSON.stringify(newSchedule)
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      addLog('SUCCESS', `Jadwal "${name}" berhasil disimpan`);
      
      // Add to local state
      schedules.push(newSchedule);
      appState.schedules = schedules;
      
      // Re-render
      renderScheduleList();
      
      // Clear form
      document.getElementById('scheduler-form')?.reset();
    } else {
      throw new Error(data.message || 'Failed to save schedule');
    }
    
  } catch (e) {
    console.error('[tab-scheduler] Save schedule error:', e);
    addLog('ERROR', `Gagal menyimpan jadwal: ${e.message}`);
  }
}

/**
 * Handle clear all schedules
 */
async function handleClearAllSchedules() {
  if (!confirm('Apakah Anda yakin ingin menghapus semua jadwal?')) {
    return;
  }
  
  try {
    const response = await fetch(`https://${appState.backendHost}/api/v1/schedule`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('trafficBusterToken')}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      addLog('SUCCESS', 'Semua jadwal berhasil dihapus');
      
      // Clear local state
      schedules = [];
      appState.schedules = schedules;
      
      // Re-render
      renderScheduleList();
    } else {
      throw new Error(data.message || 'Failed to clear schedules');
    }
    
  } catch (e) {
    console.error('[tab-scheduler] Clear schedules error:', e);
    addLog('ERROR', `Gagal menghapus jadwal: ${e.message}`);
  }
}

/**
 * Handle history clear button
 */
async function handleHistoryClear() {
  if (!confirm('Apakah Anda yakin ingin menghapus semua history?')) {
    return;
  }
  
  try {
    const response = await fetch(`https://${appState.backendHost}/api/v1/history`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('trafficBusterToken')}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      addLog('SUCCESS', 'Semua history berhasil dihapus');
      
      // Clear local state
      appState.history = [];
      
      // Re-render
      renderHistoryList();
    } else {
      throw new Error(data.message || 'Failed to clear history');
    }
    
  } catch (e) {
    console.error('[tab-scheduler] Clear history error:', e);
    addLog('ERROR', `Gagal menghapus history: ${e.message}`);
  }
}

/**
 * Render schedule list (OLD STYLE with # column)
 */
function renderScheduleList() {
  const tbody = document.getElementById('schedule-table-body');
  const emptyDiv = document.getElementById('schedule-list-empty');
  
  if (!tbody || !emptyDiv) {
    console.warn('[tab-scheduler] Schedule list elements not found');
    return;
  }
  
  if (schedules.length === 0) {
    tbody.innerHTML = '';
    emptyDiv.style.display = 'block';
    return;
  }
  
  emptyDiv.style.display = 'none';
  
  tbody.innerHTML = schedules.map((schedule, index) => {
    const startTime = formatTimestamp(schedule.startAt);
    
    return `
      <tr>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${index + 1}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${escapeHtml(schedule.name)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${escapeHtml(schedule.occurrence)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${startTime}</td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <button 
            class="text-red-600 hover:text-red-900"
            onclick="window.deleteSchedule('${schedule.id}')"
          >
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
  
  console.log(`[tab-scheduler] Rendered ${schedules.length} schedules`);
}

/**
 * Render history list
 */
function renderHistoryList() {
  const tbody = document.getElementById('history-list-tbody');
  const emptyDiv = document.getElementById('history-list-empty');
  
  if (!tbody || !emptyDiv) {
    console.warn('[tab-scheduler] History list elements not found');
    return;
  }
  
  const history = appState.history || [];
  
  if (history.length === 0) {
    tbody.innerHTML = '';
    emptyDiv.style.display = 'block';
    return;
  }
  
  emptyDiv.style.display = 'none';
  
  tbody.innerHTML = history.map(entry => {
    const startTime = formatTimestamp(entry.startTime);
    const duration = formatDuration(entry.duration);
    const stats = entry.stats || {};
    
    return `
      <tr>
        <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-900">${startTime}</td>
        <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-600">${duration}</td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="status-badge status-${entry.status}">${entry.status}</span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-600">${stats.flowDone || 0}/${stats.totalFlow || 0}</td>
        <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-600">${stats.impressions || 0}</td>
        <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-600">${stats.clicks || 0}</td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <button 
            class="text-red-600 hover:text-red-900"
            onclick="window.deleteHistory('${entry.id}')"
          >
            Del
          </button>
        </td>
      </tr>
    `;
  }).join('');
  
  console.log(`[tab-scheduler] Rendered ${history.length} history entries`);
}

/**
 * Delete schedule (exposed to window)
 */
window.deleteSchedule = async function(scheduleId) {
  if (!confirm('Hapus jadwal ini?')) {
    return;
  }
  
  try {
    const response = await fetch(`https://${appState.backendHost}/api/v1/schedule/${scheduleId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('trafficBusterToken')}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      addLog('SUCCESS', 'Jadwal berhasil dihapus');
      
      // Remove from local state
      schedules = schedules.filter(s => s.id !== scheduleId);
      appState.schedules = schedules;
      
      // Re-render
      renderScheduleList();
    } else {
      throw new Error(data.message || 'Failed to delete schedule');
    }
    
  } catch (e) {
    console.error('[tab-scheduler] Delete schedule error:', e);
    addLog('ERROR', `Gagal menghapus jadwal: ${e.message}`);
  }
};

/**
 * Delete history (exposed to window)
 */
window.deleteHistory = async function(historyId) {
  if (!confirm('Hapus history ini?')) {
    return;
  }
  
  try {
    const response = await fetch(`https://${appState.backendHost}/api/v1/history/${historyId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('trafficBusterToken')}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      addLog('SUCCESS', 'History berhasil dihapus');
      
      // Remove from local state
      appState.history = appState.history.filter(h => h.id !== historyId);
      
      // Re-render
      renderHistoryList();
    } else {
      throw new Error(data.message || 'Failed to delete history');
    }
    
  } catch (e) {
    console.error('[tab-scheduler] Delete history error:', e);
    addLog('ERROR', `Gagal menghapus history: ${e.message}`);
  }
};

/**
 * Format timestamp (ISO to readable)
 */
function formatTimestamp(isoString) {
  if (!isoString) return '-';
  
  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch (e) {
    return isoString;
  }
}

/**
 * Format duration (seconds to HH:MM:SS)
 */
function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Escape HTML (prevent XSS)
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}