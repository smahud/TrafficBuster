/*
  js/config.js
  FULL PRODUCTION MODE - NO DUMMY
  
  PERUBAHAN:
  - Semua logic dummy dihapus
  - Hanya production mode
  - Default host: trafficbuster.my.id:5252
*/

// Mode (production only)
export const MODE = 'production';

// Default Backend Host (PRODUCTION)
export const DEFAULT_API_HOST = 'trafficbuster.my.id:5252';

// Backend Logic Mode (always production)
export const USE_DUMMY_LOGIC = false;

// Warning (none)
export const DUMMY_MODE_WARNING = null;

// Dummy users (none - removed)
export const DUMMY_USERS = {};