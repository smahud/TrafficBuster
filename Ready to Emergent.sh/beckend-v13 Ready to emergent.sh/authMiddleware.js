/**
 * (MODIFIKASI: Menggunakan SESSION_GRACE_PERIOD_MS dari db.js)
 */
const jwt = require('jsonwebtoken');
// (PERUBAHAN) Impor SESSION_GRACE_PERIOD_MS
const { JWT_SECRET, SESSION_GRACE_PERIOD_MS } = require('./db');
const userStore = require('./lib/userStore');

// (DIHAPUS)
// const GRACE_PERIOD_MS = 5 * 60 * 1000;

function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ success: false, message: 'Invalid token format' });
  }

  const token = parts[1];
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (!decoded.userId || !decoded.sessionId) {
      return res.status(403).json({ success: false, message: 'Invalid token payload' });
    }
    
    req.user = {
      userId: decoded.userId,
      sessionId: decoded.sessionId
    };
    
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ success: false, message: 'Token expired' });
    }
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }
}

async function ensureAdmin(req, res, next) {
  try {
    const userId = req.user.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    
    const user = await userStore.loadUser(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    
    next();
  } catch (err) {
    console.error('ensureAdmin error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = {
  authenticateJWT,
  ensureAdmin,
  // (PERUBAHAN) Ekspor nilai yang diimpor
  GRACE_PERIOD_MS: SESSION_GRACE_PERIOD_MS 
};
