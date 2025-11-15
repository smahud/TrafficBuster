/**
 * BACKEND - lib/flowWorker.js (Implementasi V1 + Proxy Failover Patch)
 * - Semua fungsi asli dipertahankan, proxy failover dan real-time sync FE fully implemented
 * Author: smahud
 * Date: 2025-11-15
 */

'use strict';

// Placeholder flowDone increment tracking
const flowDoneTracker = {};

/**
 * Helper untuk memilih item acak dari array
 */
function selectRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Eksekusi satu flow (satu target) Playwright
 * - PATCH: proxy failover dan mark OFF + sync ke FE via emitToUser
 */
async function executeFlow(browser, job, target) {
  const { config, userId } = job;
  const { proxies, platforms } = config.loadedData;
  const settings = config;

  const startTime = Date.now();
  let context;

  // Semua proxy dengan enabled:true (tidak OFF)
  let availableProxies = proxies && Array.isArray(proxies) ? proxies.filter(p => p.enabled !== false) : [];
  let proxyFailCount = 0;
  let lastProxyError = null;
  let selectedProxy = null;
  let platformUsed = null;

  // Default context options
  const contextOptions = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  };

  // Proxy failover loop
  while (availableProxies.length > 0) {
    selectedProxy = selectRandom(availableProxies);

    if (!selectedProxy) break;

    contextOptions.proxy = {
      server: `${selectedProxy.host}:${selectedProxy.port}`,
      username: selectedProxy.username,
      password: selectedProxy.password
    };
    job.emitLog('debug', `Attempting proxy: ${selectedProxy.host}:${selectedProxy.port}`);

    // Pilih platform acak
    platformUsed = selectRandom(platforms);
    if (platformUsed) {
      const res = selectRandom(platformUsed.resolutions);
      if (res && res.includes('x')) {
        const [w, h] = res.split('x').map(Number);
        if (w && h) contextOptions.viewport = { width: w, height: h };
      }
      job.emitLog('debug', `Platform: ${platformUsed.osDevice || 'Custom'} @ ${contextOptions.viewport.width}x${contextOptions.viewport.height}`);
    }

    try {
      context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      // Navigasi utama flow
      await page.goto(target.url, { timeout: 30000, waitUntil: 'domcontentloaded' });

      // Human Surfing Simulation
      const dwellMin = settings.sessionDuration?.min || 1000;
      const dwellMax = settings.sessionDuration?.max || 3000;
      const dwellTime = Math.floor(dwellMin + Math.random() * (dwellMax - dwellMin));
      if (settings.humanSurfing?.autoPageScrolling) {
        job.emitLog('debug', `Scrolling...`);
        await page.waitForTimeout(1000 + Math.random() * 2000);
        await page.mouse.wheel(0, 500 + Math.random() * 1000);
        await page.waitForTimeout(500 + Math.random() * 1000);
      }
      job.emitLog('debug', `Dwelling for ${Math.round(dwellTime / 1000)}s...`);
      await page.waitForTimeout(dwellTime);

      // TODO: implement autoClick logic if needed.

      // Tutup page/context
      await page.close();
      await context.close();

      // Tracking flowDone sebagai logic lama
      const trackerKey = `${userId}:${target.id}`;
      const newCount = (flowDoneTracker[trackerKey] || 0) + 1;
      flowDoneTracker[trackerKey] = newCount;

      return {
        success: true,
        targetId: target.id,
        newFlowDone: newCount,
        durationMs: Date.now() - startTime
      };
    } catch (proxyErr) {
      proxyFailCount++;
      lastProxyError = proxyErr;

      // PATCH: MARK PROXY OFF - SYNC ke FE real-time
      selectedProxy.enabled = false;
      if (job.emitToUser) {
        job.emitToUser('proxyStatusUpdate', {
          proxyId: selectedProxy.id,
          host: selectedProxy.host,
          enabled: false
        });
      }
      job.emitLog('warn', `Proxy ${selectedProxy.host}:${selectedProxy.port} failed during job; marked OFF.`);

      if (context) await context.close();
      // Remove failed proxy from array
      availableProxies = availableProxies.filter(p => p.id !== selectedProxy.id);
    }
  }

  if (proxyFailCount > 0) {
    job.emitLog('warn', `${proxyFailCount} proxies failed and marked OFF for user ${userId}`);
  }
  if (!context && lastProxyError) {
    throw new Error(`All proxies failed during flow: ${lastProxyError.message}`);
  }
}

module.exports = { executeFlow, flowDoneTracker };
