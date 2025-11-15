/**
 * scripts/clear-session.js
 * CLI tool to clear user sessions (untuk development & testing)
 * Usage: node scripts/clear-session.js premium
 */

'use strict';

const path = require('path');
const userStore = require('../lib/userStore');

async function clearSession(username) {
  try {
    const sanitized = userStore.sanitizeUsername(username);
    const user = await userStore.loadUser(sanitized);
    
    if (!user) {
      console.error(`❌ User '${username}' not found`);
      process.exit(1);
    }
    
    if (!user.sessions || user.sessions.length === 0) {
      console.log(`ℹ️  User '${username}' has no active sessions`);
      process.exit(0);
    }
    
    const sessionCount = user.sessions.length;
    user.sessions = [];
    await userStore.saveUser(sanitized, user);
    
    console.log(`✅ Cleared ${sessionCount} session(s) for user '${username}'`);
    process.exit(0);
    
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

const username = process.argv[2];

if (!username) {
  console.error('Usage: node scripts/clear-session.js <username>');
  console.error('Example: node scripts/clear-session.js premium');
  process.exit(1);
}

clearSession(username);
