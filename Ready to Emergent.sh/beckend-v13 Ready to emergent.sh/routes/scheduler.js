/**
 * BACKEND - routes/scheduler.js (BARU)
 * (Prioritas 2: Implementasi Scheduler)
 *
 * Menyediakan API endpoint untuk mengelola job terjadwal.
 * - POST /api/v1/schedule/create
 * - GET  /api/v1/schedule/list
 * - DELETE /api/v1/schedule/:id
 */
'use strict';

const express = require('express');
const scheduler = require('../lib/scheduler');
const userStore = require('../lib/userStore');
const { deriveFeatureMatrix } = require('../lib/licenseMatrix');
const { appendAudit } = require('../lib/audit');

function makeSchedulerRouter(deps) {
  const router = express.Router();
  const { authenticateJWT } = deps;

  // Middleware untuk memuat matriks lisensi
  const checkLicense = async (req, res, next) => {
    try {
      const user = await userStore.loadUser(req.user.userId);
      const matrix = deriveFeatureMatrix(user);
      if (!matrix.allowScheduler) {
        return res.status(403).json({
          success: false,
          sessionActive: true,
          code: 'LICENSE_FEATURE_DISABLED',
          message: 'Scheduler tidak diizinkan untuk lisensi Anda.'
        });
      }
      req.user.matrix = matrix; // Teruskan matrix
      next();
    } catch (e) {
      res.status(500).json({ success: false, sessionActive: true, message: 'Server error saat validasi lisensi' });
    }
  };

  /**
   * POST /api/v1/schedule/create
   * Membuat job terjadwal baru.
   * Payload: { scheduleConfig: {...}, jobPayload: {...} }
   */
  router.post('/create', authenticateJWT, checkLicense, async (req, res) => {
    try {
      const { userId } = req.user;
      const { scheduleConfig, jobPayload } = req.body;

      if (!scheduleConfig || !jobPayload) {
        return res.status(400).json({ success: false, sessionActive: true, message: 'Payload tidak lengkap. Membutuhkan scheduleConfig dan jobPayload.' });
      }
      
      const job = await scheduler.createScheduledJob(userId, scheduleConfig, jobPayload);
      await appendAudit(userId, 'schedule_create', { jobId: job.id, name: job.name, nextRun: job.nextRun });
      
      res.status(201).json({ success: true, sessionActive: true, job });

    } catch (e) {
      console.error('[routes/scheduler] Gagal membuat job:', e.message);
      res.status(400).json({ success: false, sessionActive: true, message: e.message });
    }
  });

  /**
   * GET /api/v1/schedule/list
   * Mengambil semua job terjadwal untuk user.
   */
  router.get('/list', authenticateJWT, checkLicense, async (req, res) => {
    try {
      const { userId } = req.user;
      const jobs = await scheduler.listScheduledJobs(userId);
      res.json({ success: true, sessionActive: true, jobs });
    } catch (e) {
      console.error('[routes/scheduler] Gagal mengambil list:', e.message);
      res.status(500).json({ success: false, sessionActive: true, message: e.message });
    }
  });

  /**
   * DELETE /api/v1/schedule/:id
   * Menghapus job terjadwal.
   */
  router.delete('/:id', authenticateJWT, checkLicense, async (req, res) => {
    try {
      const { userId } = req.user;
      const { id } = req.params;

      await scheduler.deleteScheduledJob(userId, id);
      await appendAudit(userId, 'schedule_delete', { jobId: id });
      
      res.json({ success: true, sessionActive: true, message: `Job ${id} dihapus.` });
    } catch (e) {
      console.error('[routes/scheduler] Gagal menghapus job:', e.message);
      if (e.message.includes('Job tidak ditemukan')) {
        return res.status(404).json({ success: false, sessionActive: true, message: e.message });
      }
      res.status(400).json({ success: false, sessionActive: true, message: e.message });
    }
  });

  return router;
}

module.exports = makeSchedulerRouter;
