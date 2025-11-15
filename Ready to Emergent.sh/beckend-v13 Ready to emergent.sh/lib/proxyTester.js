/**
 * BACKEND - lib/proxyTester.js (FIXED - SPEED CHECK)
 * Proxy testing dengan protocol fallback + speed validation
 * Credit: smahud - 2025-11-14 03:07:12 UTC
 * 
 * CRITICAL FIX:
 * - Reject proxy if speed > timeout (quality filter)
 * - Timeout applies to both network AND response speed
 * - Protocol fallback: SOCKS5 → SOCKS4 → HTTPS → HTTP
 */

'use strict';

const https = require('https');
const http = require('http');

let HttpsProxyAgent, SocksProxyAgent;

try {
  const httpsProxyModule = require('https-proxy-agent');
  HttpsProxyAgent = httpsProxyModule.HttpsProxyAgent || httpsProxyModule;
} catch (e) {
  console.warn('[proxyTester] https-proxy-agent not installed.');
}

try {
  const socksProxyModule = require('socks-proxy-agent');
  SocksProxyAgent = socksProxyModule.SocksProxyAgent || socksProxyModule;
} catch (e) {
  console.warn('[proxyTester] socks-proxy-agent not installed.');
}

async function testProxy(proxyConfig, testUrl = 'https://www.google.com/generate_204', timeout = 10000) {
  const startTime = Date.now();
  
  const { host, port, username, password } = proxyConfig;
  
  if (!host || !port) {
    return { success: false, error: 'Invalid proxy config' };
  }
  
  const cleanHost = String(host).replace(/^(socks5?|https?):\/\//i, '').trim();
  const cleanPort = parseInt(port, 10);
  
  if (isNaN(cleanPort) || cleanPort <= 0 || cleanPort > 65535) {
    return { success: false, error: 'Invalid port' };
  }
  
  console.log(`[proxyTester] Testing ${cleanHost}:${cleanPort} timeout=${timeout}ms`);
  
  const protocols = [
    { name: 'SOCKS5', test: () => testSocks5(cleanHost, cleanPort, username, password, testUrl, timeout, startTime) },
    { name: 'SOCKS4', test: () => testSocks4(cleanHost, cleanPort, testUrl, timeout, startTime) },
    { name: 'HTTPS', test: () => testHttpsProxy(cleanHost, cleanPort, username, password, testUrl, timeout, startTime) },
    { name: 'HTTP', test: () => testHttpProxy(cleanHost, cleanPort, username, password, testUrl, timeout, startTime) }
  ];
  
  const errors = [];
  
  for (const protocol of protocols) {
    try {
      console.log(`[proxyTester] → Trying ${protocol.name}...`);
      const result = await protocol.test();
      
      if (result.success) {
        console.log(`[proxyTester] ✓ ${protocol.name} works! (${result.speed}ms)`);
        return { ...result, protocol: protocol.name };
      } else {
        console.log(`[proxyTester] ✗ ${protocol.name} failed: ${result.error}`);
        errors.push(`${protocol.name}: ${result.error}`);
      }
    } catch (e) {
      console.error(`[proxyTester] ✗ ${protocol.name} error: ${e.message}`);
      errors.push(`${protocol.name}: ${e.message}`);
    }
  }
  
  console.error(`[proxyTester] ✗ All protocols failed for ${cleanHost}:${cleanPort}`);
  return { success: false, error: `All protocols failed. ${errors.join('; ')}` };
}

/**
 * Test SOCKS5 proxy (WITH SPEED CHECK)
 */
async function testSocks5(host, port, username, password, testUrl, timeout, startTime) {
  if (!SocksProxyAgent) {
    return { success: false, error: 'SocksProxyAgent not available' };
  }
  
  return new Promise((resolve) => {
    try {
      let proxyUrl;
      if (username && password) {
        proxyUrl = `socks5://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
      } else {
        proxyUrl = `socks5://${host}:${port}`;
      }
      
      const agent = new SocksProxyAgent(proxyUrl);
      
      const req = https.get(testUrl, {
        agent,
        timeout,
        headers: { 'User-Agent': 'TrafficBuster/1.0' }
      }, (res) => {
        const speed = Date.now() - startTime;
        
        // ** CRITICAL FIX: Check if speed exceeds timeout **
        if (speed > timeout) {
          console.log(`[proxyTester] ✗ SOCKS5 too slow: ${speed}ms > ${timeout}ms`);
          return resolve({ 
            success: false, 
            error: `Too slow (${speed}ms > ${timeout}ms)` 
          });
        }
        
        if (res.statusCode >= 200 && res.statusCode < 400) {
          const country = res.headers['cf-ipcountry'] || res.headers['x-country'] || 'Unknown';
          resolve({ success: true, speed, country });
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
        }
        
        res.resume();
      });
      
      req.on('error', (err) => {
        resolve({ success: false, error: err.message || 'Connection failed' });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: `Network timeout (>${timeout}ms)` });
      });
      
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
}

/**
 * Test SOCKS4 proxy (WITH SPEED CHECK)
 */
async function testSocks4(host, port, testUrl, timeout, startTime) {
  if (!SocksProxyAgent) {
    return { success: false, error: 'SocksProxyAgent not available' };
  }
  
  return new Promise((resolve) => {
    try {
      const proxyUrl = `socks4://${host}:${port}`;
      const agent = new SocksProxyAgent(proxyUrl);
      
      const req = https.get(testUrl, {
        agent,
        timeout,
        headers: { 'User-Agent': 'TrafficBuster/1.0' }
      }, (res) => {
        const speed = Date.now() - startTime;
        
        // ** CRITICAL FIX: Check if speed exceeds timeout **
        if (speed > timeout) {
          console.log(`[proxyTester] ✗ SOCKS4 too slow: ${speed}ms > ${timeout}ms`);
          return resolve({ 
            success: false, 
            error: `Too slow (${speed}ms > ${timeout}ms)` 
          });
        }
        
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve({ success: true, speed, country: 'Unknown' });
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
        }
        
        res.resume();
      });
      
      req.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: `Network timeout (>${timeout}ms)` });
      });
      
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
}

/**
 * Test HTTPS proxy (WITH SPEED CHECK)
 */
async function testHttpsProxy(host, port, username, password, testUrl, timeout, startTime) {
  if (!HttpsProxyAgent) {
    return { success: false, error: 'HttpsProxyAgent not available' };
  }
  
  return new Promise((resolve) => {
    try {
      let proxyUrl;
      if (username && password) {
        proxyUrl = `https://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
      } else {
        proxyUrl = `https://${host}:${port}`;
      }
      
      const agent = new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false });
      
      const req = https.get(testUrl, {
        agent,
        timeout,
        headers: { 'User-Agent': 'TrafficBuster/1.0' }
      }, (res) => {
        const speed = Date.now() - startTime;
        
        // ** CRITICAL FIX: Check if speed exceeds timeout **
        if (speed > timeout) {
          console.log(`[proxyTester] ✗ HTTPS too slow: ${speed}ms > ${timeout}ms`);
          return resolve({ 
            success: false, 
            error: `Too slow (${speed}ms > ${timeout}ms)` 
          });
        }
        
        if (res.statusCode >= 200 && res.statusCode < 400) {
          const country = res.headers['cf-ipcountry'] || res.headers['x-country'] || 'Unknown';
          resolve({ success: true, speed, country });
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
        }
        
        res.resume();
      });
      
      req.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: `Network timeout (>${timeout}ms)` });
      });
      
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
}

/**
 * Test HTTP proxy (WITH SPEED CHECK)
 */
async function testHttpProxy(host, port, username, password, testUrl, timeout, startTime) {
  if (!HttpsProxyAgent) {
    return { success: false, error: 'HttpsProxyAgent not available' };
  }
  
  return new Promise((resolve) => {
    try {
      let proxyUrl;
      if (username && password) {
        proxyUrl = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
      } else {
        proxyUrl = `http://${host}:${port}`;
      }
      
      const agent = new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false });
      
      const req = https.get(testUrl, {
        agent,
        timeout,
        headers: { 'User-Agent': 'TrafficBuster/1.0' }
      }, (res) => {
        const speed = Date.now() - startTime;
        
        // ** CRITICAL FIX: Check if speed exceeds timeout **
        if (speed > timeout) {
          console.log(`[proxyTester] ✗ HTTP too slow: ${speed}ms > ${timeout}ms`);
          return resolve({ 
            success: false, 
            error: `Too slow (${speed}ms > ${timeout}ms)` 
          });
        }
        
        if (res.statusCode >= 200 && res.statusCode < 400) {
          const country = res.headers['cf-ipcountry'] || res.headers['x-country'] || 'Unknown';
          resolve({ success: true, speed, country });
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
        }
        
        res.resume();
      });
      
      req.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: `Network timeout (>${timeout}ms)` });
      });
      
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
}

module.exports = { testProxy };
