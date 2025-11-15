/**
 * BACKEND - routes/history.js (FIXED PATH)
 * Job History API Routes
 * Credit: smahud - 2025-11-14 20:55:30 UTC
 * 
 * CRITICAL FIX:
 * - Changed path from '../middleware/authMiddleware' to '../authMiddleware'
 * 
 * Endpoints:
 * - GET    /api/v1/history          Get all history
 * - GET    /api/v1/history/stats    Get history statistics
 * - DELETE /api/v1/history          Clear all history
 * - DELETE /api/v1/history/:id      Delete specific history
 */

'use strict';

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../authMiddleware'); // ** FIXED: Remove 'middleware/' **
const historyManager = require('../lib/historyManager');

/**
 * GET /api/v1/history
 * Get all history entries
 */
router.get('/', authenticateJWT, (req, res) => {
  try {
    const history = historyManager.getAllHistory();
    
    res.json({
      success: true,
      count: history.length,
      history: history
    });
  } catch (e) {
    console.error('[history API] Failed to get history:', e.message);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve history'
    });
  }
});

/**
 * GET /api/v1/history/stats
 * Get history statistics
 */
router.get('/stats', authenticateJWT, (req, res) => {
  try {
    const stats = historyManager.getHistoryStats();
    
    res.json({
      success: true,
      stats: stats
    });
  } catch (e) {
    console.error('[history API] Failed to get stats:', e.message);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve statistics'
    });
  }
});

/**
 * DELETE /api/v1/history
 * Clear all history
 */
router.delete('/', authenticateJWT, (req, res) => {
  try {
    historyManager.clearAllHistory();
    
    res.json({
      success: true,
      message: 'All history cleared'
    });
  } catch (e) {
    console.error('[history API] Failed to clear history:', e.message);
    res.status(500).json({
      success: false,
      message: 'Failed to clear history'
    });
  }
});

/**
 * DELETE /api/v1/history/:id
 * Delete specific history entry
 */
router.delete('/:id', authenticateJWT, (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'History ID required'
      });
    }
    
    const deleted = historyManager.deleteHistory(id);
    
    if (deleted) {
      res.json({
        success: true,
        message: `History ${id} deleted`
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'History not found'
      });
    }
  } catch (e) {
    console.error('[history API] Failed to delete history:', e.message);
    res.status(500).json({
      success: false,
      message: 'Failed to delete history'
    });
  }
});

module.exports = router;
