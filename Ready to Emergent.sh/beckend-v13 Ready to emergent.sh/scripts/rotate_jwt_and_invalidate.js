#!/usr/bin/env node
/**
 * scripts/rotate_jwt_and_invalidate.js
 * Credit: Rotation helper for JWT_SECRET + optional session invalidation
 *
 * Usage:
 *   node scripts/rotate_jwt_and_invalidate.js            # rotate secret only (backup .env)
 *   node scripts/rotate_jwt_and_invalidate.js --invalidate-all
 *   node scripts/rotate_jwt_and_invalidate.js --invalidate-user username
 *
 * Notes:
 * - This will overwrite .env (backing up to .env.bak.TIMESTAMP)
 * - After rotating, you MUST restart the backend process to pick up new JWT_SECRET.
 * - If you invalidate sessions, all current sessions will be cleared (users must re-login).
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const userStore = require('../lib/userStore');

const ENV_PATH = path.join(process.cwd(), '.env');

function usage() {
  console.log('Usage: node scripts/rotate_jwt_and_invalidate.js [--invalidate-all] [--invalidate-user username]');
  process.exit(1);
}

function genSecret() {
  return crypto.randomBytes(48).toString('hex'); // 96 chars hex (384 bits)
}

async function backupEnv() {
  try {
    const now = Date.now();
    const bak = `${ENV_PATH}.bak.${now}`;
    await fs.copyFile(ENV_PATH, bak);
    console.log('Backed up .env to', bak);
  } catch (e) {
    console.log('No existing .env to back up (creating new).');
  }
}

async function writeEnv(newSecret) {
  const content = `JWT_SECRET=${newSecret}\n`;
  await fs.writeFile(ENV_PATH, content, 'utf8');
  console.log('.env updated with new JWT_SECRET (do NOT commit this file)');
}

async function invalidateAll() {
  console.log('Invalidating sessions for all users...');
  const dir = userStore.USERS_DIR;
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const username = f.replace(/\.json$/i, '');
      try {
        const u = await userStore.loadUser(username);
        if (!u) continue;
        u.sessions = [];
        await userStore.saveUser(u);
        console.log(`- cleared sessions for ${username}`);
      } catch (e) {
        console.error('Failed to clear sessions for', username, e && e.message ? e.message : e);
      }
    }
  } catch (e) {
    console.error('invalidateAll error', e && e.message ? e.message : e);
  }
}

async function invalidateUser(username) {
  try {
    const u = await userStore.loadUser(username);
    if (!u) {
      console.log('User not found:', username);
      return;
    }
    u.sessions = [];
    await userStore.saveUser(u);
    console.log('Cleared sessions for', username);
  } catch (e) {
    console.error('invalidateUser error', e && e.message ? e.message : e);
  }
}

(async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) usage();
  const invalidateAllFlag = args.includes('--invalidate-all');
  const userIdx = args.indexOf('--invalidate-user');
  let invalidateUserArg = null;
  if (userIdx !== -1) {
    invalidateUserArg = args[userIdx + 1];
    if (!invalidateUserArg) usage();
  }

  const newSecret = genSecret();
  await backupEnv();
  await writeEnv(newSecret);

  if (invalidateAllFlag) {
    await invalidateAll();
  } else if (invalidateUserArg) {
    await invalidateUser(invalidateUserArg);
  }

  console.log('\nDONE: JWT_SECRET rotated. Next steps:');
  console.log('- Restart the backend process (npm start or node server.js) to load the new secret.');
  console.log('- Any existing JWT tokens will be invalid (if you invalidated sessions). Users must login again to obtain new tokens.');
  console.log('- Keep the .env file secure (do NOT commit).');
})();
