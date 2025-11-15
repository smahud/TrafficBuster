/**
 * Backend - routes/admin.js
 * Credit: Admin routes for TrafficBuster
 *
 * Exports a function that accepts dependencies and returns an Express router.
 *
 * Endpoints:
 * - POST /api/v1/admin/create-user    { username, password, email, license, role }
 * - POST /api/v1/admin/delete-user    { username }
 * - POST /api/v1/admin/change-password { username, newPassword }
 * - POST /api/v1/admin/change-license { username, license, licenseConfig }
 * - GET  /api/v1/admin/users          list users (no passwords)
 * - POST /api/v1/admin/invalidate-sessions { username }
 * - GET  /api/v1/admin/status         returns server status, connected users, active jobs summary
 *
 * Security: requires authenticateJWT then ensureAdmin (provided by authMiddleware)
 */

const express = require('express');

function makeAdminRouter(deps) {
  const router = express.Router();
  
  // PERBAIKAN: Pastikan semua dependencies ada dan berupa function
  const { 
    userStore, 
    appendAudit, 
    ensureAdmin, 
    authenticateJWT, 
    getClientsSnapshot, 
    jobStates, 
    activeJobIntervals 
  } = deps;

  // PERBAIKAN: Validasi dependencies
  if (typeof authenticateJWT !== 'function') {
    throw new Error('authenticateJWT must be a function');
  }
  if (typeof ensureAdmin !== 'function') {
    throw new Error('ensureAdmin must be a function');
  }

  // create-user
  router.post('/create-user', authenticateJWT, ensureAdmin, async (req, res) => {
    try {
      const { username, password, email, license, role } = req.body || {};
      if (!username || !password) return res.status(400).json({ success: false, message: 'username and password required' });
      const sanitized = userStore.sanitizeUsername(username);
      await userStore.ensureUserExists(sanitized, email || `${sanitized}@example.com`, license || 'Free');
      await userStore.setPassword(sanitized, password);
      // set role if provided
      const u = await userStore.loadUser(sanitized);
      u.role = role || 'user';
      if (!u.license) u.license = license || 'Free';
      if (!u.licenseConfig) u.licenseConfig = {};
      await userStore.saveUser(u);
      await appendAudit(req.user.userId, 'admin_create_user', { created: sanitized });
      res.json({ success: true, message: 'User created', user: { username: sanitized, email: u.email, license: u.license, role: u.role } });
    } catch (e) {
      console.error('admin.create-user error', e);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // delete-user
  router.post('/delete-user', authenticateJWT, ensureAdmin, async (req, res) => {
    try {
      const { username } = req.body || {};
      if (!username) return res.status(400).json({ success: false, message: 'username required' });
      const sanitized = userStore.sanitizeUsername(username);
      const fp = require('path').join(userStore.USERS_DIR, `${sanitized}.json`);
      try {
        await require('fs').promises.unlink(fp);
      } catch (e) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      await appendAudit(req.user.userId, 'admin_delete_user', { deleted: sanitized });
      res.json({ success: true, message: 'User deleted' });
    } catch (e) {
      console.error('admin.delete-user error', e);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // change-password
  router.post('/change-password', authenticateJWT, ensureAdmin, async (req, res) => {
    try {
      const { username, newPassword } = req.body || {};
      if (!username || !newPassword) return res.status(400).json({ success: false, message: 'username and newPassword required' });
      const sanitized = userStore.sanitizeUsername(username);
      await userStore.setPassword(sanitized, newPassword);
      await appendAudit(req.user.userId, 'admin_change_password', { for: sanitized });
      res.json({ success: true, message: 'Password changed' });
    } catch (e) {
      console.error('admin.change-password error', e);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // change-license
  router.post('/change-license', authenticateJWT, ensureAdmin, async (req, res) => {
    try {
      const { username, license, licenseConfig } = req.body || {};
      if (!username || !license) return res.status(400).json({ success: false, message: 'username and license required' });
      const sanitized = userStore.sanitizeUsername(username);
      const u = await userStore.loadUser(sanitized);
      if (!u) return res.status(404).json({ success: false, message: 'User not found' });
      u.license = license;
      u.licenseConfig = licenseConfig || {};
      await userStore.saveUser(u);
      await appendAudit(req.user.userId, 'admin_change_license', { for: sanitized, license, licenseConfig: u.licenseConfig });
      res.json({ success: true, message: 'License updated', user: { username: sanitized, license: u.license, licenseConfig: u.licenseConfig } });
    } catch (e) {
      console.error('admin.change-license error', e);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // list users (sanitized, no password)
  router.get('/users', authenticateJWT, ensureAdmin, async (req, res) => {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const dir = userStore.USERS_DIR;
      const files = await fs.readdir(dir);
      const out = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const raw = await fs.readFile(path.join(dir, f), 'utf8');
        const u = JSON.parse(raw);
        out.push({ username: u.username, email: u.email, license: u.license, role: u.role || 'user', sessionsCount: (u.sessions || []).length, licenseConfig: u.licenseConfig || {} });
      }
      res.json({ success: true, users: out });
    } catch (e) {
      console.error('admin.users error', e);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // invalidate-sessions (clear all sessions for a user)
  router.post('/invalidate-sessions', authenticateJWT, ensureAdmin, async (req, res) => {
    try {
      const { username } = req.body || {};
      if (!username) return res.status(400).json({ success: false, message: 'username required' });
      const sanitized = userStore.sanitizeUsername(username);
      const u = await userStore.loadUser(sanitized);
      if (!u) return res.status(404).json({ success: false, message: 'User not found' });
      u.sessions = [];
      await userStore.saveUser(u);
      await appendAudit(req.user.userId, 'admin_invalidate_sessions', { for: sanitized });
      res.json({ success: true, message: 'Sessions invalidated' });
    } catch (e) {
      console.error('admin.invalidate-sessions error', e);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // server status
  router.get('/status', authenticateJWT, ensureAdmin, async (req, res) => {
    try {
      const uptime = process.uptime();
      const clients = getClientsSnapshot ? getClientsSnapshot() : [];
      const connectedUsers = clients.length;
      // jobStates: a map object passed in deps
      const jobsSummary = {};
      if (jobStates) {
        for (const uid in jobStates) {
          jobsSummary[uid] = jobStates[uid];
        }
      }
      // activeJobIntervals contains currently running intervals map
      const activeInstances = activeJobIntervals ? Array.from(activeJobIntervals.keys()) : [];
      res.json({ success: true, status: { uptime, connectedUsers, clients, jobsSummary, activeInstances } });
    } catch (e) {
      console.error('admin.status error', e);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  return router;
}

module.exports = makeAdminRouter;
