// --- FRONTEND ---
// File: state.js
/*
  Centralized Application State
  Import default values dari config.js
*/

import { DEFAULT_BACKEND_HOST, PLATFORM_DB_VERSION, DEFAULT_SETTINGS } from './config.js';

export const appStateDefault = {
  generalTargets: [],
  geoProxies: [],
  platforms: [],
  schedules: [],
  user: null,
  isAuthenticated: false,
  jobStatus: { status: "idle" },
  backendHost: DEFAULT_BACKEND_HOST, // ← Import dari config.js
  platformDBVersion: PLATFORM_DB_VERSION, // ← Import dari config.js
  features: null,
  settings: { ...DEFAULT_SETTINGS } // ← Import dari config.js (deep copy)
};

export const appState = JSON.parse(JSON.stringify(appStateDefault));