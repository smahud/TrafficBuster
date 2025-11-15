/**
 * BACKEND - db.js
 * (MODIFIKASI: Menjadi pemuat konfigurasi .env terpusat)
 *
 * - Membaca JWT_SECRET, PORT, dan variabel Sesi dari .env.
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Muat .env dari root proyek
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || null;

// Validasi JWT (Kritis)
if (!JWT_SECRET || String(JWT_SECRET).trim().length === 0) {
  const envPath = path.join(process.cwd(), '.env');
  const hasEnv = fs.existsSync(envPath);
  console.error('FATAL: JWT_SECRET is not set. Backend will not start without a JWT secret for secure tokens.');
  console.error(`- Expected to find JWT_SECRET in environment (.env at: ${envPath}${hasEnv ? ')' : ', but .env not found)'})`);
  console.error('- To generate a strong secret, you can run: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  console.error('- Then create .env with: JWT_SECRET=<your_generated_secret>');
  process.exit(1);
}

// (BARU) Muat variabel lain dengan nilai default
const PORT = parseInt(process.env.PORT || '5151', 10);
const SESSION_GRACE_PERIOD_MS = parseInt(process.env.SESSION_GRACE_PERIOD_MS || '300000', 10);
const SESSION_CLEAN_INTERVAL_MS = parseInt(process.env.SESSION_CLEAN_INTERVAL_MS || '60000', 10);

module.exports = {
  JWT_SECRET,
  PORT,
  SESSION_GRACE_PERIOD_MS,
  SESSION_CLEAN_INTERVAL_MS
};
