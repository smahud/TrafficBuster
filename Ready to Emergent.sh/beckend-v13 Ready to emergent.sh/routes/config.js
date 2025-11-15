/**
 * BACKEND - routes/config.js (TODOLIST 18)
 * Config Push/Load Routes
 * Credit: smahud - 2025-11-14 22:40:00 UTC
 */

'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

/**
 * POST /api/v1/config - Push config to server
 */
router.post('/', async (req, res) => {
  try {
    const { userId } = req.user;
    const config = req.body;
    
    // Validate config
    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid config data'
      });
    }
    
    // Save to: users/{userId}/config.json
    const userDir = path.join(__dirname, '..', 'users', userId);
    const configPath = path.join(userDir, 'config.json');
    
    // Ensure user directory exists
    await fs.mkdir(userDir, { recursive: true });
    
    // Write config
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    console.log(`[config] Config saved for user: ${userId}`);
    
    res.json({
      success: true,
      message: 'Config saved successfully'
    });
    
  } catch (error) {
    console.error('[config] Push error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save config'
    });
  }
});

/**
 * GET /api/v1/config - Load config from server
 */
router.get('/', async (req, res) => {
  try {
    const { userId } = req.user;
    
    const configPath = path.join(__dirname, '..', 'users', userId, 'config.json');
    
    // Check if config exists
    try {
      await fs.access(configPath);
    } catch (e) {
      return res.status(404).json({
        success: false,
        message: 'No config found on server'
      });
    }
    
    // Read config
    const data = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(data);
    
    console.log(`[config] Config loaded for user: ${userId}`);
    
    res.json({
      success: true,
      config: config
    });
    
  } catch (error) {
    console.error('[config] Load error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load config'
    });
  }
});

module.exports = router;
