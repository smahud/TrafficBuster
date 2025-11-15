/**
 * BACKEND - lib/datasetStore.js
 * Dataset storage untuk targets, proxies, platforms, settings (Tugas 51-54)
 * Credit: smahud - 2025-11-12 22:28:30 UTC
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const userStore = require('./userStore');

const DATASETS_DIR_NAME = 'datasets';
const TMP_DIR_NAME = 'tmp';
const CHUNKS_DIR_NAME = 'chunks';

const DEFAULT_EXPECT_CHUNKS_MAX = parseInt(process.env.CHUNK_MAX_COUNT || '1000', 10);
const MAX_SETNAME_LEN = 64;

// TUGAS 51-53: Support 4 tipe dataset
const ALLOWED_TYPES = new Set(['targets', 'proxies', 'platforms', 'settings']);

function sanitizeSetName(name) {
  if (!name) return null;
  return String(name).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, MAX_SETNAME_LEN);
}

function makeUploadId() {
  return 'ul_' + crypto.randomBytes(10).toString('hex');
}

async function ensureDir(p) { 
  await fs.mkdir(p, { recursive: true }); 
}

function userBaseDir(userId) {
  return path.join(userStore.USERS_DIR, userId, DATASETS_DIR_NAME);
}

function datasetFilePath(userId, datasetType, setName) {
  return path.join(userBaseDir(userId), datasetType, `${setName}.json`);
}

function uploadTmpDir(userId, uploadId) {
  return path.join(userBaseDir(userId), TMP_DIR_NAME, uploadId);
}

function uploadChunksDir(userId, uploadId) {
  return path.join(uploadTmpDir(userId, uploadId), CHUNKS_DIR_NAME);
}

function metaFile(userId, uploadId) {
  return path.join(uploadTmpDir(userId, uploadId), 'meta.json');
}

function datasetTypeDir(userId, datasetType) {
  return path.join(userBaseDir(userId), datasetType);
}

// Normalisasi targets (sudah ada dari versi lama)
function enforceTargetsShape(rawItems) {
  if (!Array.isArray(rawItems)) throw new Error('VALIDATION_ERROR: items must be an array');
  const out = [];
  let autoIdx = 1;
  const seenUrl = new Set();
  for (const it of rawItems) {
    if (!it || typeof it !== 'object') continue;
    const urlRaw = (it.url || '').trim();
    if (!urlRaw) continue;
    const normUrl = urlRaw.toLowerCase();
    if (seenUrl.has(normUrl)) continue;
    seenUrl.add(normUrl);

    let id = it.id ? String(it.id).slice(0, 64) : 't_' + autoIdx++;
    const flowTarget = Number.isFinite(it.flowTarget) && it.flowTarget >= 0 ? Math.floor(it.flowTarget) : 0;
    const clickTarget = Number.isFinite(it.clickTarget) && it.clickTarget >= 0 ? Math.floor(it.clickTarget) : 0;

    out.push({ id, url: urlRaw, flowTarget, clickTarget });
  }
  return out;
}

// TUGAS 51: Normalisasi proxies
function enforceProxiesShape(rawItems) {
  if (!Array.isArray(rawItems)) throw new Error('VALIDATION_ERROR: items must be an array');
  const out = [];
  let autoIdx = 1;
  const seenHost = new Set();
  
  for (const it of rawItems) {
    if (!it || typeof it !== 'object') continue;
    
    const host = (it.host || '').trim();
    const port = parseInt(it.port, 10);
    
    if (!host || !Number.isFinite(port) || port <= 0) continue;
    
    const hostKey = `${host}:${port}`;
    if (seenHost.has(hostKey)) continue;
    seenHost.add(hostKey);
    
    let id = it.id || 'p_' + autoIdx++;
    
    out.push({
      id: String(id).slice(0, 64),
      host,
      port,
      username: it.username ? String(it.username).slice(0, 128) : '',
      password: it.password ? String(it.password).slice(0, 128) : '',
      enabled: it.enabled !== false
    });
  }
  return out;
}

// TUGAS 52: Normalisasi platforms
function enforcePlatformsShape(rawItems) {
  if (!Array.isArray(rawItems)) throw new Error('VALIDATION_ERROR: items must be an array');
  const out = [];
  let autoIdx = 1;
  
  for (const it of rawItems) {
    if (!it || typeof it !== 'object') continue;
    
    const osDevice = (it.osDevice || it.os || '').trim();
    const browser = (it.browser || '').trim();
    
    if (!osDevice || !browser) continue;
    
    let id = it.id || 'pl_' + autoIdx++;
    
    out.push({
      id: String(id).slice(0, 64),
      osDevice,
      osVersion: it.osVersion ? String(it.osVersion).slice(0, 64) : '',
      browser,
      baseVersion: it.baseVersion || it.browserVersion ? String(it.baseVersion || it.browserVersion).slice(0, 32) : '',
      resolutions: Array.isArray(it.resolutions) ? it.resolutions : []
    });
  }
  return out;
}

// TUGAS 53: Normalisasi settings
function enforceSettingsShape(rawItems) {
  if (!Array.isArray(rawItems)) throw new Error('VALIDATION_ERROR: items must be an array');
  
  if (rawItems.length === 0) {
    throw new Error('VALIDATION_ERROR: settings must have at least one item');
  }
  
  const it = rawItems[0];
  if (!it || typeof it !== 'object') {
    throw new Error('VALIDATION_ERROR: settings item must be an object');
  }
  
  const out = {
    id: it.id || 's_' + Date.now(),
    ...it
  };
  
  return [out];
}

/* Upload lifecycle */
async function startUpload(userId, { datasetType, setName, mode, expectChunks, totalItems }) {
  if (!ALLOWED_TYPES.has(datasetType)) throw new Error('VALIDATION_ERROR: unsupported datasetType');
  const sanitizedSet = sanitizeSetName(setName);
  if (!sanitizedSet) throw new Error('VALIDATION_ERROR: invalid setName');

  const m = String(mode || 'replace').toLowerCase();
  if (!['replace', 'append', 'upsert'].includes(m)) throw new Error('VALIDATION_ERROR: invalid mode');

  const chunks = parseInt(expectChunks, 10);
  if (!Number.isFinite(chunks) || chunks <= 0 || chunks > DEFAULT_EXPECT_CHUNKS_MAX) {
    throw new Error('VALIDATION_ERROR: expectChunks invalid');
  }

  const uploadId = makeUploadId();
  const chunkDir = uploadChunksDir(userId, uploadId);
  await ensureDir(chunkDir);

  const meta = {
    uploadId,
    userId,
    datasetType,
    setName: sanitizedSet,
    mode: m,
    expectChunks: chunks,
    receivedChunks: 0,
    totalItems: Number.isFinite(totalItems) ? totalItems : null,
    createdAt: new Date().toISOString()
  };

  await fs.writeFile(metaFile(userId, uploadId), JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

async function appendChunk(userId, uploadId, chunkIndex, itemsArray) {
  const metaPath = metaFile(userId, uploadId);
  let meta;
  try {
    meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
  } catch {
    throw new Error('UPLOAD_SESSION_NOT_FOUND');
  }
  if (meta.userId !== userId) throw new Error('UPLOAD_SESSION_NOT_FOUND');

  const cIdx = parseInt(chunkIndex, 10);
  if (!Number.isFinite(cIdx) || cIdx < 0 || cIdx >= meta.expectChunks) {
    throw new Error('UPLOAD_INVALID_CHUNK: index out of range');
  }

  const chunkDir = uploadChunksDir(userId, uploadId);
  await ensureDir(chunkDir);
  const chunkFile = path.join(chunkDir, `${cIdx}.json`);

  // Hindari overwrite
  try {
    await fs.access(chunkFile);
    throw new Error('UPLOAD_INVALID_CHUNK: duplicate chunkIndex');
  } catch {
    // not exists -> ok
  }

  // TUGAS 51-53: Normalisasi berdasarkan tipe
  let normItems = [];
  if (meta.datasetType === 'targets') {
    normItems = enforceTargetsShape(itemsArray);
  } else if (meta.datasetType === 'proxies') {
    normItems = enforceProxiesShape(itemsArray);
  } else if (meta.datasetType === 'platforms') {
    normItems = enforcePlatformsShape(itemsArray);
  } else if (meta.datasetType === 'settings') {
    normItems = enforceSettingsShape(itemsArray);
  } else {
    throw new Error('VALIDATION_ERROR: unsupported datasetType (internal)');
  }

  await fs.writeFile(chunkFile, JSON.stringify(normItems, null, 2), 'utf8');

  meta.receivedChunks += 1;
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  return { chunkIndex: cIdx, count: normItems.length, receivedChunks: meta.receivedChunks, expectChunks: meta.expectChunks };
}

async function finalizeUpload(userId, uploadId) {
  const metaPath = metaFile(userId, uploadId);
  let meta;
  try {
    meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
  } catch {
    throw new Error('UPLOAD_SESSION_NOT_FOUND');
  }
  if (meta.userId !== userId) throw new Error('UPLOAD_SESSION_NOT_FOUND');
  if (meta.receivedChunks !== meta.expectChunks) {
    throw new Error('UPLOAD_INVALID_CHUNK: incomplete upload');
  }

  const chunkDir = uploadChunksDir(userId, uploadId);
  let merged = [];
  for (let i = 0; i < meta.expectChunks; i++) {
    const cf = path.join(chunkDir, `${i}.json`);
    try {
      const raw = await fs.readFile(cf, 'utf8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) merged = merged.concat(arr);
    } catch {
      throw new Error('UPLOAD_INVALID_CHUNK: missing chunk ' + i);
    }
  }

  // existing
  const dstFile = datasetFilePath(userId, meta.datasetType, meta.setName);
  let existing = [];
  if (meta.mode !== 'replace') {
    try {
      const rawExisting = await fs.readFile(dstFile, 'utf8');
      const exArr = JSON.parse(rawExisting);
      if (Array.isArray(exArr)) existing = exArr;
    } catch {}
  }

  let finalData;
  if (meta.mode === 'replace') {
    finalData = merged;
  } else if (meta.mode === 'append') {
    finalData = existing.concat(merged);
  } else {
    const byUrl = new Map();
    for (const it of existing) {
      const key = it.url ? it.url.toLowerCase() : it.id;
      byUrl.set(key, it);
    }
    for (const it of merged) {
      const key = it.url ? it.url.toLowerCase() : it.id;
      byUrl.set(key, it);
    }
    finalData = Array.from(byUrl.values());
  }

  await ensureDir(path.dirname(dstFile));
  const tmpFile = dstFile + '.tmp.' + crypto.randomBytes(6).toString('hex');
  await fs.writeFile(tmpFile, JSON.stringify(finalData, null, 2), 'utf8');
  await fs.rename(tmpFile, dstFile);

  // cleanup
  try { await fs.rm(uploadTmpDir(userId, uploadId), { recursive: true, force: true }); } catch {}

  return { datasetType: meta.datasetType, setName: meta.setName, items: finalData.length };
}

async function listDatasets(userId, datasetType) {
  if (!ALLOWED_TYPES.has(datasetType)) throw new Error('VALIDATION_ERROR: unsupported datasetType');
  const dir = datasetTypeDir(userId, datasetType);
  let files = [];
  try { files = await fs.readdir(dir); } catch { return []; }
  const out = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const setName = f.replace(/\.json$/i, '');
    try {
      const full = path.join(dir, f);
      const stat = await fs.stat(full);
      const raw = await fs.readFile(full, 'utf8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        out.push({ setName, items: arr.length, updatedAt: stat.mtime.toISOString() });
      }
    } catch {}
  }
  return out;
}

async function getDataset(userId, datasetType, setName) {
  const sanitized = sanitizeSetName(setName);
  if (!sanitized) throw new Error('VALIDATION_ERROR: invalid setName');
  if (!ALLOWED_TYPES.has(datasetType)) throw new Error('VALIDATION_ERROR: unsupported datasetType');

  const fp = datasetFilePath(userId, datasetType, sanitized);
  try {
    const raw = await fs.readFile(fp, 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    throw new Error('DATASET_NOT_FOUND');
  }
}

async function deleteDataset(userId, datasetType, setName) {
  const sanitized = sanitizeSetName(setName);
  if (!sanitized) throw new Error('VALIDATION_ERROR: invalid setName');
  if (!ALLOWED_TYPES.has(datasetType)) throw new Error('VALIDATION_ERROR: unsupported datasetType');

  const fp = datasetFilePath(userId, datasetType, sanitized);
  try {
    await fs.unlink(fp);
    return true;
  } catch {
    throw new Error('DATASET_NOT_FOUND');
  }
}

module.exports = {
  startUpload,
  appendChunk,
  finalizeUpload,
  listDatasets,
  getDataset,
  deleteDataset,
  sanitizeSetName
};
