/**
 * BACKEND - lib/licenseMatrix.js
 * (PELAKSANAAN TUGAS 50: Mengganti INF dengan 9999 untuk stabilitas)
 *
 * - Unlimited kini direpresentasikan sebagai INF=9999 (bukan Infinity).
 * - Menambahkan limit baru: maxPlatforms.
 * - Menambahkan flag baru: allowScheduler.
 * - Premium: maxProxies = 10 (sesuai konfirmasi Anda).
 */

'use strict';

// --- PERUBAHAN UTAMA: Unlimited -> angka pasti ---
const INF = 9999;

const DEFAULTS = {
  Free: {
    maxInstances: 1,
    maxTargets: 1,
    maxProxies: 0,
    maxPlatforms: 3,              // Sesuai spek (batas ringan)
    allowProxies: false,
    allowGeolocation: false,
    allowHumanSurfing: false,
    allowExternalClicks: false,
    allowPlatformCustom: true,    // Diizinkan, tapi tetap terbatas oleh maxPlatforms
    allowSettingsAdvanced: false, // Mengunci fitur advanced (mis. human surfing & multi-instance)
    allowScheduler: false
  },
  Premium: {
    maxInstances: 1,              // Sesuai spek
    maxTargets: 10,
    maxProxies: 10,               // Sesuai konfirmasi Anda
    maxPlatforms: INF,
    allowProxies: true,
    allowGeolocation: true,
    allowHumanSurfing: true,
    allowExternalClicks: true,
    allowPlatformCustom: true,
    allowSettingsAdvanced: true,
    allowScheduler: true
  },
  Enterprise: {
    maxInstances: INF,
    maxTargets: INF,
    maxProxies: INF,
    maxPlatforms: INF,
    allowProxies: true,
    allowGeolocation: true,
    allowHumanSurfing: true,
    allowExternalClicks: true,
    allowPlatformCustom: true,
    allowSettingsAdvanced: true,
    allowScheduler: true
  }
};

const FLAG_KEYS = [
  'allowProxies',
  'allowGeolocation',
  'allowHumanSurfing',
  'allowExternalClicks',
  'allowPlatformCustom',
  'allowSettingsAdvanced',
  'allowScheduler'
];

const LIMIT_KEYS = [
  'maxInstances',
  'maxTargets',
  'maxProxies',
  'maxPlatforms'
];

function normalizeLicense(license) {
  if (!license) return 'Free';
  const lc = String(license).toLowerCase();
  if (lc === 'free') return 'Free';
  if (lc === 'premium') return 'Premium';
  if (lc === 'enterprise') return 'Enterprise';
  return 'Free';
}

function getDefaultLicenseMatrix(license) {
  const key = normalizeLicense(license);
  const base = DEFAULTS[key] || DEFAULTS.Free;
  return JSON.parse(JSON.stringify({ license: key, ...base }));
}

function applyLicenseConfigOverrides(matrix, licenseConfig) {
  if (!licenseConfig || typeof licenseConfig !== 'object') return matrix;

  // Limit overrides (boleh mengubah batas ke angka lain)
  LIMIT_KEYS.forEach(k => {
    if (licenseConfig[k] !== undefined && licenseConfig[k] !== null) {
      const v = Number(licenseConfig[k]);
      if (!Number.isNaN(v) && v > 0) {
        matrix[k] = v;
      }
    }
  });

  // Feature flag overrides
  FLAG_KEYS.forEach(k => {
    if (licenseConfig[k] !== undefined) {
      matrix[k] = Boolean(licenseConfig[k]);
    }
  });

  return matrix;
}

function deriveFeatureMatrix(user) {
  if (!user) return getDefaultLicenseMatrix('Free');
  const license = user.license || 'Free';
  let matrix = getDefaultLicenseMatrix(license);

  if (license === 'Enterprise') {
    matrix = applyLicenseConfigOverrides(matrix, user.licenseConfig);
  } else if (user.licenseConfig && typeof user.licenseConfig === 'object') {
    // Non-Enterprise: izinkan menurunkan limit atau mematikan fitur (tidak boleh menaikkan)
    LIMIT_KEYS.forEach(k => {
      if (user.licenseConfig[k] !== undefined && user.licenseConfig[k] !== null) {
        const v = Number(user.licenseConfig[k]);
        if (!Number.isNaN(v) && v > 0 && v < matrix[k]) {
          matrix[k] = v;
        }
      }
    });
    FLAG_KEYS.forEach(k => {
      if (user.licenseConfig[k] === false) {
        matrix[k] = false;
      }
    });
  }

  return matrix;
}

/**
 * usage:
 * {
 *   instanceCount?: number,
 *   targets?: number,
 *   proxies?: number,
 *   platforms?: number,
 *   requires?: { allowProxies?: true, allowHumanSurfing?: true, ... }
 * }
 */
function validateUsageAgainstMatrix(matrix, usage) {
  const errors = [];
  const u = usage || {};

  // Limits
  const inst = Number(u.instanceCount ?? 0);
  const t = u.targets !== undefined ? Number(u.targets) : undefined;
  const p = u.proxies !== undefined ? Number(u.proxies) : undefined;
  const pf = u.platforms !== undefined ? Number(u.platforms) : undefined;

  if (Number.isFinite(inst) && inst > matrix.maxInstances) {
    errors.push({
      code: 'LIMIT_MAX_INSTANCES',
      message: `Instance count ${inst} exceeds maxInstances ${matrix.maxInstances}`,
      meta: { requested: inst, limit: matrix.maxInstances }
    });
  }
  if (t !== undefined && Number.isFinite(t) && t > matrix.maxTargets) {
    errors.push({
      code: 'LIMIT_MAX_TARGETS',
      message: `Targets count ${t} exceeds maxTargets ${matrix.maxTargets}`,
      meta: { requested: t, limit: matrix.maxTargets }
    });
  }
  if (p !== undefined && Number.isFinite(p) && p > matrix.maxProxies) {
    errors.push({
      code: 'LIMIT_MAX_PROXIES',
      message: `Proxies count ${p} exceeds maxProxies ${matrix.maxProxies}`,
      meta: { requested: p, limit: matrix.maxProxies }
    });
  }
  if (pf !== undefined && Number.isFinite(pf) && pf > matrix.maxPlatforms) {
    errors.push({
      code: 'LIMIT_MAX_PLATFORMS',
      message: `Platforms count ${pf} exceeds maxPlatforms ${matrix.maxPlatforms}`,
      meta: { requested: pf, limit: matrix.maxPlatforms }
    });
  }

  // Feature gating (opsional)
  if (u.requires && typeof u.requires === 'object') {
    for (const flag of Object.keys(u.requires)) {
      if (FLAG_KEYS.includes(flag)) {
        if (u.requires[flag] && matrix[flag] !== true) {
          errors.push({
            code: 'LICENSE_FEATURE_DISABLED',
            message: `Feature '${flag}' is disabled by license`,
            meta: { feature: flag }
          });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// Tidak ada lagi Infinity -> null. Tetap sediakan fungsi agar kompatibel dengan FE.
function publicizeMatrix(matrix) {
  return JSON.parse(JSON.stringify(matrix));
}

module.exports = {
  deriveFeatureMatrix,
  validateUsageAgainstMatrix,
  publicizeMatrix,
  getDefaultLicenseMatrix,
  applyLicenseConfigOverrides,
  DEFAULTS,
  INF
};
