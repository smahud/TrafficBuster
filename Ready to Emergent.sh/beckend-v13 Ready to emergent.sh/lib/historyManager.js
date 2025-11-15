/**
 * BACKEND - lib/historyManager.js
 * Job History Manager
 * Credit: smahud - 2025-11-14 05:29:00 UTC
 * 
 * Features:
 * - Save job history to JSON file
 * - Load history on server start
 * - Auto-cleanup old history (>30 days)
 * - Thread-safe file operations
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '..', 'data', 'history.json');
const MAX_HISTORY_AGE_DAYS = 30; // Auto-delete history older than 30 days

let historyCache = [];
let isLoading = false;

/**
 * Ensure data directory exists
 */
function ensureDataDir() {
  const dataDir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('[historyManager] Created data directory:', dataDir);
  }
}

/**
 * Load history from file
 */
function loadHistory() {
  if (isLoading) {
    console.warn('[historyManager] Already loading, skipping');
    return historyCache;
  }
  
  isLoading = true;
  
  try {
    ensureDataDir();
    
    if (!fs.existsSync(HISTORY_FILE)) {
      console.log('[historyManager] No history file found, starting fresh');
      historyCache = [];
      isLoading = false;
      return historyCache;
    }
    
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(data);
    
    if (Array.isArray(parsed)) {
      historyCache = parsed;
      console.log(`[historyManager] Loaded ${historyCache.length} history entries`);
    } else {
      console.warn('[historyManager] Invalid history format, resetting');
      historyCache = [];
    }
    
    // Auto-cleanup old entries
    cleanupOldHistory();
    
  } catch (e) {
    console.error('[historyManager] Failed to load history:', e.message);
    historyCache = [];
  }
  
  isLoading = false;
  return historyCache;
}

/**
 * Save history to file
 */
function saveHistory() {
  try {
    ensureDataDir();
    
    const data = JSON.stringify(historyCache, null, 2);
    fs.writeFileSync(HISTORY_FILE, data, 'utf8');
    
    console.log(`[historyManager] Saved ${historyCache.length} history entries`);
    return true;
  } catch (e) {
    console.error('[historyManager] Failed to save history:', e.message);
    return false;
  }
}

/**
 * Add new history entry
 */
function addHistory(entry) {
  if (!entry || typeof entry !== 'object') {
    console.error('[historyManager] Invalid history entry');
    return false;
  }
  
  // Validate required fields
  if (!entry.id || !entry.startTime) {
    console.error('[historyManager] Missing required fields (id, startTime)');
    return false;
  }
  
  // Add to cache
  historyCache.unshift(entry); // Add to beginning (newest first)
  
  // Save to file
  saveHistory();
  
  console.log(`[historyManager] Added history entry: ${entry.id}`);
  return true;
}

/**
 * Get all history
 */
function getAllHistory() {
  return historyCache;
}

/**
 * Get history by ID
 */
function getHistoryById(id) {
  return historyCache.find(h => h.id === id);
}

/**
 * Update history entry (for stop time, stats, etc.)
 */
function updateHistory(id, updates) {
  const index = historyCache.findIndex(h => h.id === id);
  
  if (index === -1) {
    console.error(`[historyManager] History not found: ${id}`);
    return false;
  }
  
  // Merge updates
  historyCache[index] = {
    ...historyCache[index],
    ...updates
  };
  
  // Save to file
  saveHistory();
  
  console.log(`[historyManager] Updated history: ${id}`);
  return true;
}

/**
 * Delete history by ID
 */
function deleteHistory(id) {
  const initialLength = historyCache.length;
  historyCache = historyCache.filter(h => h.id !== id);
  
  if (historyCache.length < initialLength) {
    saveHistory();
    console.log(`[historyManager] Deleted history: ${id}`);
    return true;
  }
  
  console.warn(`[historyManager] History not found: ${id}`);
  return false;
}

/**
 * Clear all history
 */
function clearAllHistory() {
  historyCache = [];
  saveHistory();
  console.log('[historyManager] Cleared all history');
  return true;
}

/**
 * Cleanup old history (>30 days)
 */
function cleanupOldHistory() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_HISTORY_AGE_DAYS);
  const cutoffTime = cutoffDate.toISOString();
  
  const initialLength = historyCache.length;
  historyCache = historyCache.filter(h => {
    return h.startTime >= cutoffTime;
  });
  
  const deleted = initialLength - historyCache.length;
  
  if (deleted > 0) {
    saveHistory();
    console.log(`[historyManager] Cleaned up ${deleted} old history entries (>${MAX_HISTORY_AGE_DAYS} days)`);
  }
  
  return deleted;
}

/**
 * Get history statistics
 */
function getHistoryStats() {
  if (historyCache.length === 0) {
    return {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      totalImpressions: 0,
      totalClicks: 0,
      avgDuration: 0
    };
  }
  
  let completedJobs = 0;
  let failedJobs = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalDuration = 0;
  
  historyCache.forEach(h => {
    if (h.status === 'completed') completedJobs++;
    if (h.status === 'failed') failedJobs++;
    
    if (h.stats) {
      totalImpressions += h.stats.impressions || 0;
      totalClicks += h.stats.clicks || 0;
    }
    
    if (h.duration) {
      totalDuration += h.duration;
    }
  });
  
  return {
    totalJobs: historyCache.length,
    completedJobs,
    failedJobs,
    totalImpressions,
    totalClicks,
    avgDuration: historyCache.length > 0 ? Math.round(totalDuration / historyCache.length) : 0
  };
}

// Load history on module init
loadHistory();

module.exports = {
  loadHistory,
  saveHistory,
  addHistory,
  getAllHistory,
  getHistoryById,
  updateHistory,
  deleteHistory,
  clearAllHistory,
  cleanupOldHistory,
  getHistoryStats
};
