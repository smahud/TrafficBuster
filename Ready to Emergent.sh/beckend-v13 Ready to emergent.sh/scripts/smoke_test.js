/**
 * scripts/smoke_test.js
 * Credit: Smoke test script for TrafficBuster (Node)
 *
 * This script:
 * - logs in a user (enterprise by default)
 * - connects to WSS and listens to messages
 * - sends heartbeat
 * - posts a /run/start request to start a demo job
 * - waits a bit for progress messages, then stops the job
 *
 * Usage:
 *   export NODE_TLS_REJECT_UNAUTHORIZED=0
 *   node scripts/smoke_test.js
 *
 * Note: This version uses global fetch available in Node 18+.
 */

const WebSocket = require('ws');
const https = require('https');

const API_HOST = process.env.API_HOST || 'localhost:5151';
const USER = process.env.TEST_USER || 'enterprise';
const PASS = process.env.TEST_PASS || '123';

// Use global fetch if available (Node 18+). If not, try to require node-fetch (v2).
let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    // node-fetch v2 supports CommonJS require
    // If you prefer, install: npm install node-fetch@2
    // eslint-disable-next-line global-require
    fetchFn = require('node-fetch');
  } catch (e) {
    console.error('No global fetch and node-fetch not installed. Install node-fetch or use Node 18+.');
    process.exit(1);
  }
}

async function login() {
  const url = `https://${API_HOST}/api/v1/login`;
  const opts = {
    method: 'POST',
    body: JSON.stringify({ username: USER, password: PASS }),
    headers: { 'Content-Type': 'application/json' },
    agent: new https.Agent({ rejectUnauthorized: false })
  };
  const resp = await fetchFn(url, opts);
  const text = await resp.text();
  try {
    const data = JSON.parse(text);
    if (!data || !data.success) throw new Error('Login response not success: ' + JSON.stringify(data));
    return data.token;
  } catch (e) {
    console.error('Login response was not valid JSON. Raw response follows:\n', text);
    throw new Error('Login failed or returned HTML/invalid JSON');
  }
}

async function run() {
  console.log('Logging in...');
  const token = await login();
  console.log('Token obtained (len):', token.length);

  const wsUrl = `wss://${API_HOST}/?token=${encodeURIComponent(token)}`;
  console.log('Connecting WS to', wsUrl);
  const ws = new WebSocket(wsUrl, { rejectUnauthorized: false });

  ws.on('open', () => {
    console.log('WS open. Sending initial heartbeat...');
    ws.send(JSON.stringify({ type: 'heartbeat' }));
  });

  ws.on('message', (msg) => {
    console.log('WS msg:', msg.toString());
  });

  // wait for connection open
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('WS open timeout')), 5000);
    ws.once('open', () => { clearTimeout(t); resolve(); });
    ws.once('error', (err) => { clearTimeout(t); reject(err); });
  });

  // Start demo job
  const payload = {
    generalTargets: [
      { id: 't1', url: 'example.com', flowTarget: 10, clickTarget: 2 }
    ],
    settings: { instanceCount: 1 }
  };
  console.log('Starting job...');
  const startResp = await fetchFn(`https://${API_HOST}/api/v1/run/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(payload),
    agent: new https.Agent({ rejectUnauthorized: false })
  });
  const startText = await startResp.text();
  try {
    console.log('Start response:', JSON.parse(startText));
  } catch (e) {
    console.log('Start response (raw):', startText);
  }

  // wait 8 seconds to receive progress
  await new Promise(r => setTimeout(r, 8000));

  console.log('Stopping job...');
  const stopResp = await fetchFn(`https://${API_HOST}/api/v1/run/stop`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    agent: new https.Agent({ rejectUnauthorized: false })
  });
  const stopText = await stopResp.text();
  try {
    console.log('Stop response:', JSON.parse(stopText));
  } catch (e) {
    console.log('Stop response (raw):', stopText);
  }

  ws.close(1000, 'smoke test finished');
  console.log('Smoke test done.');
}

run().catch(err => {
  console.error('Smoke test failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
