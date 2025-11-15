/**
 * BACKEND - app.js (UPDATED - TODOLIST 17)
 * Credit: smahud - 2025-11-14 20:53:45 UTC
 * 
 * CHANGES:
 * - Added history routes import
 * - Registered /api/v1/history endpoint
 */

'use strict';

const express = require('express');
const cors_import = require('cors');
const helmet_import = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('./db');

// Auth & stores
const { authenticateJWT, ensureAdmin, GRACE_PERIOD_MS } = require('./authMiddleware');
const userStore = require('./lib/userStore');
const jobManager = require('./lib/jobManager');
const { appendAudit } = require('./lib/audit');
const { getClientsSnapshot, sendToUser } = require('./websocket');

// License
const { deriveFeatureMatrix, publicizeMatrix, validateUsageAgainstMatrix } = require('./lib/licenseMatrix');

// Routers
const makeDatasetsRouter = require('./routes/datasets');
const makeAdminRouter = require('./routes/admin');
const makeSchedulerRouter = require('./routes/scheduler');
const historyRouter = require('./routes/history'); // ** NEW - Todolist 17 **

// Minimal sessionTimeout middleware
const sessionTimeout = require('./sessionTimeout');

// Normalisasi CJS/ESM default export
const cors = cors_import.default || cors_import;
const helmet = helmet_import.default || helmet_import;

const app = express();

/* ---------- Global Middleware ---------- */
app.disable('x-powered-by');
app.use(cors({
  origin: (origin, cb) => {
    const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:5151')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);
    if (!origin || allowed.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked: ' + origin));
  },
  methods: ['GET','POST','DELETE'],
  allowedHeaders: ['Content-Type','Authorization'],
  maxAge: 300
}));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-origin' } }));
app.use(morgan('dev'));
app.use(express.json({ limit: process.env.BODY_LIMIT || '32kb' }));
app.use(sessionTimeout);

/* ---------- Rate Limiting ---------- */
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, sessionActive: false, message: 'Too many login attempts, please try again later.' }
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, sessionActive: false, message: 'Too many requests, try again later.' }
});
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, sessionActive: true, message: 'Too many upload requests' }
});
const runLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, sessionActive: true, message: 'Too many run requests' }
});

app.use('/api/', apiLimiter);
app.post('/api/v1/login', loginLimiter);

/* ---------- Root ---------- */
app.get('/', (req, res) => {
  res.send('TrafficBuster Backend v10 (Stable + Scheduler + History) - Ready.');
});

/* ---------- Login (features + sessionActive) ---------- */
app.post('/api/v1/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, sessionActive: false, message: 'Username & password required' });
    }

    const sanitized = userStore.sanitizeUsername(username);
    const user = await userStore.loadUser(sanitized);
    if (!user) {
      await appendAudit(sanitized, 'login_failed', { ip: req.ip, reason: 'user_not_found' });
      return res.status(401).json({ success: false, sessionActive: false, message: 'Username or Password incorrect' });
    }

    const ok = await userStore.verifyPassword(sanitized, password);
    if (!ok) {
      await appendAudit(sanitized, 'login_failed', { ip: req.ip, reason: 'bad_password' });
      return res.status(401).json({ success: false, sessionActive: false, message: 'Username or Password incorrect' });
    }

    // Single-login + Grace
    const sessions = user.sessions || [];
    const nowMs = Date.now();
    const activeRecent = sessions.some(s => (nowMs - new Date(s.lastSeen).getTime()) <= GRACE_PERIOD_MS);
    if (activeRecent) {
      await appendAudit(sanitized, 'login_rejected_active', { ip: req.ip, graceMsRemaining: GRACE_PERIOD_MS });
      return res.status(409).json({ success: false, sessionActive: false, message: 'Active session exists. Wait 5 minutes after other device disconnects.' });
    }

    const clientInfo = { ip: req.ip, ua: req.get('User-Agent') || 'unknown' };
    const session = await userStore.createSession(sanitized, clientInfo);
    const token = jwt.sign({ userId: sanitized, sessionId: session.sessionId }, JWT_SECRET, { expiresIn: process.env.JWT_EXP || '8h' });

    await appendAudit(sanitized, 'login_success', { sessionId: session.sessionId, ip: req.ip });

    const features = publicizeMatrix(deriveFeatureMatrix(user));

    res.json({
      success: true,
      sessionActive: true,
      token,
      user: {
        username: user.username,
        email: user.email,
        license: user.license,
        role: user.role || 'user',
        licenseConfig: user.licenseConfig || {}
      },
      features
    });
  } catch (e) {
    console.error('[login] error', e);
    res.status(500).json({ success: false, sessionActive: false, message: 'Server error' });
  }
});

/* ---------- Logout ---------- */
app.post('/api/v1/logout', authenticateJWT, async (req, res) => {
  try {
    const { userId, sessionId } = req.user;
    await userStore.invalidateSession(userId, sessionId);
    await appendAudit(userId, 'logout', { sessionId });
    await jobManager.stopAllJobsForUser(userId);
    res.json({ success: false, sessionActive: false, message: 'Logged out' });
  } catch (e) {
    console.error('[logout] error', e);
    res.status(500).json({ success: false, sessionActive: false, message: 'Server error' });
  }
});

/* ---------- Heartbeat ---------- */
app.post('/api/v1/heartbeat', authenticateJWT, async (req, res) => {
  try {
    const { userId, sessionId } = req.user;
    const s = await userStore.updateSessionLastSeen(userId, sessionId); 
    if (!s) return res.status(404).json({ success: false, sessionActive: false, message: 'Session not found' });
    res.json({ success: true, sessionActive: true, message: 'heartbeat updated' });
  } catch (e) {
    console.error('[heartbeat] error', e);
    res.status(500).json({ success: false, sessionActive: false, message: 'Server error' });
  }
});

/* ---------- Validate (features + sessionActive) ---------- */
app.post('/api/v1/validate', authenticateJWT, async (req, res) => {
  try {
    const { userId, sessionId } = req.user;
    const sessionValid = await userStore.getSession(userId, sessionId); 
    if (!sessionValid || sessionValid.status !== 'active') {
      return res.status(401).json({ success: false, sessionActive: false, code: 'SESSION_INVALIDATED', message: 'Sesi ini telah di-logout dari perangkat lain.' });
    }

    const user = await userStore.loadUser(userId);
    if (!user) {
      return res.status(404).json({ success: false, sessionActive: false, code: 'USER_NOT_FOUND', message: 'User tidak ditemukan.' });
    }

    const features = publicizeMatrix(deriveFeatureMatrix(user));
    res.json({
      success: true,
      sessionActive: true,
      message: 'Session valid',
      user: { username: user.username, email: user.email, license: user.license, role: user.role },
      features
    });
  } catch (err) {
    console.error('[validate] error', err);
    res.status(500).json({ success: false, sessionActive: false, code: 'INTERNAL_ERROR', message: 'Server error' });
  }
});

/* ---------- User features endpoint ---------- */
app.get('/api/v1/user/features', authenticateJWT, async (req, res) => {
  try {
    const { userId } = req.user;
    const user = await userStore.loadUser(userId);
    if (!user) return res.status(404).json({ success: false, sessionActive: true, message: 'User not found' });
    const features = publicizeMatrix(deriveFeatureMatrix(user));
    res.json({ success: true, sessionActive: true, features });
  } catch (e) {
    console.error('[features] error', e);
    res.status(500).json({ success: false, sessionActive: true, message: 'Server error' });
  }
});

/* ---------- DATASETS ROUTER ---------- */
const datasetsRouter = makeDatasetsRouter({ authenticateJWT });
app.use('/api/v1/data', uploadLimiter, datasetsRouter);

/* ---------- SCHEDULER ROUTER ---------- */
const schedulerRouter = makeSchedulerRouter({ authenticateJWT });
app.use('/api/v1/schedule', authenticateJWT, schedulerRouter);

/* ---------- CONFIG ROUTER (NEW - Todolist 18) ---------- */
const configRouter = require('./routes/config');
app.use('/api/v1/config', authenticateJWT, configRouter);

/* ---------- HISTORY ROUTER (NEW - Todolist 17) ---------- */
app.use('/api/v1/history', historyRouter);

/* ---------- ADMIN ROUTER ---------- */
const adminRouter = makeAdminRouter({
  userStore,
  appendAudit,
  ensureAdmin,
  authenticateJWT,
  getClientsSnapshot,
  jobStates: jobManager.jobStates || {},
  activeJobIntervals: jobManager.activeJobIntervals || {}
});
app.use('/api/v1/admin', adminRouter);

/* ---------- RUN endpoints ---------- */
app.post('/api/v1/run/start', runLimiter, authenticateJWT, async (req, res) => {
  const { userId } = req.user;
  const config = req.body || {};
  try {
    const user = await userStore.loadUser(userId);
    const matrix = deriveFeatureMatrix(user);

    const usage = {
      instanceCount: config.settingsProfile ? config.settingsProfile.instanceCount : (config.instanceCount || (config.settings?.instanceCount || 1))
    };
    const check = validateUsageAgainstMatrix(matrix, usage);
    if (!check.valid) {
      const first = check.errors[0];
      return res.status(402).json({ success: false, sessionActive: true, code: first.code, message: first.message, meta: first.meta });
    }
    
    const job = await jobManager.createJob(user, matrix, config, (type, payload) => {
      sendToUser(userId, { type, ...payload });
    });
    
    console.log(`[run/start] Job ${job.jobId} started for ${userId}`);
    res.json({ success: true, sessionActive: true, jobId: job.jobId, status: job.status, message: 'Job started' });
  } catch (e) {
    console.error('[run/start] error', e);
    if (e.message && (e.message.startsWith('JOB_ALREADY_RUNNING') || e.message.startsWith('JOB_LIMIT_REACHED'))) {
      return res.status(409).json({ success: false, sessionActive: true, code: 'JOB_ALREADY_RUNNING', message: 'Pekerjaan lain sedang berjalan untuk user ini.' });
    }
    if (e.message && e.message.startsWith('DATASET_NOT_FOUND')) {
      return res.status(404).json({ success: false, sessionActive: true, code: 'DATASET_NOT_FOUND', message: 'Dataset tidak ditemukan.' });
    }
    res.status(500).json({ success: false, sessionActive: true, message: 'Server error' });
  }
});

app.post('/api/v1/run/stop', runLimiter, authenticateJWT, async (req, res) => {
  const { userId } = req.user;
  try {
    const stopped = await jobManager.stopJob(userId);
    if (!stopped) {
      return res.status(404).json({ success: false, sessionActive: true, message: 'Tidak ada job aktif untuk user ini.' });
    }
    res.json({ success: true, sessionActive: true, message: 'Job dihentikan', jobId: stopped.jobId });
  } catch (e) {
    console.error('[run/stop] error', e);
    res.status(500).json({ success: false, sessionActive: true, message: 'Server error' });
  }
});

/* ---------- Fallback 404 ---------- */
app.use('/api', (req, res) => res.status(404).json({ success: false, sessionActive: true, message: 'API Not Found' }));

/* ---------- Server Start ---------- */
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`TrafficBuster backend v10 listening on port ${PORT}`);
  });
}

module.exports = app;
