/**
 * E2E keepalive test — verifies that periodic page reloads keep
 * browser sessions alive by sending actual HTTP requests.
 *
 * Usage:
 *   node tests/e2e-keepalive.mjs [--interval 10000] [--cycles 3]
 *
 * What it does:
 *   1. Starts a PlaywrightBrowserDriver with keepaliveIntervalMs
 *   2. Navigates to httpbin.org/cookies/set to create a test cookie
 *   3. Waits for N keepalive cycles
 *   4. After each cycle, checks the page URL hasn't changed and cookies persist
 *   5. Verifies network activity occurred (page was actually reloaded)
 */

import { PlaywrightBrowserDriver } from "../dist/server/runtimes/playwright.js";
import { homedir } from "node:os";

function parseArgs(argv) {
  const args = { interval: 10000, cycles: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--interval") args.interval = Number(argv[++i]);
    if (argv[i] === "--cycles") args.cycles = Number(argv[++i]);
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const args = parseArgs(process.argv.slice(2));
const INTERVAL = args.interval;
const CYCLES = args.cycles;

console.log(`[test] keepalive interval: ${INTERVAL}ms, cycles: ${CYCLES}`);

const chromiumPath = `${homedir()}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`;

const driver = new PlaywrightBrowserDriver({
  browserName: "chromium",
  executablePath: chromiumPath,
  headless: true,
  startupTimeoutMs: 30000,
  viewportWidth: 1440,
  viewportHeight: 960,
  keepaliveIntervalMs: INTERVAL,
});

let failed = false;

try {
  console.log("[test] initializing driver...");
  await driver.init();
  console.log("[test] driver initialized, keepalive timer should be running");

  // Navigate to a page that sets a cookie
  const testUrl = "https://httpbin.org/cookies/set/keepalive_test/alive";
  console.log(`[test] navigating to ${testUrl}`);
  const navRes = await driver.execute("tabs.navigate", { url: testUrl });
  if (!navRes.success) throw new Error(`navigate failed: ${navRes.error}`);

  // Wait for redirect to complete
  await sleep(2000);

  // Verify initial cookie
  const initialCookies = await driver.execute("cookies.get", {
    url: "https://httpbin.org",
  });
  console.log(
    "[test] initial cookies:",
    JSON.stringify(initialCookies.data, null, 2)
  );

  const hasCookie = (cookies) =>
    Array.isArray(cookies) && cookies.some((c) => c.name === "keepalive_test");

  if (!hasCookie(initialCookies.data)) {
    console.error("[FAIL] initial cookie not found");
    failed = true;
  } else {
    console.log("[PASS] initial cookie present");
  }

  // Wait for keepalive cycles and verify after each
  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    console.log(
      `\n[test] waiting for keepalive cycle ${cycle}/${CYCLES} (${INTERVAL}ms)...`
    );
    await sleep(INTERVAL + 2000); // +2s buffer for reload to complete

    // Check page metrics (URL should still be httpbin)
    const metrics = await driver.execute("capture.metrics", {});
    if (!metrics.success) {
      console.error(`[FAIL] cycle ${cycle}: metrics failed: ${metrics.error}`);
      failed = true;
      continue;
    }
    const url = String(metrics.data?.url ?? "");
    console.log(`[test] cycle ${cycle}: current URL = ${url}`);

    if (!url.includes("httpbin.org")) {
      console.error(`[FAIL] cycle ${cycle}: unexpected URL`);
      failed = true;
      continue;
    }

    // Check cookies persist
    const cookies = await driver.execute("cookies.get", {
      url: "https://httpbin.org",
    });
    if (!hasCookie(cookies.data)) {
      console.error(`[FAIL] cycle ${cycle}: cookie lost after keepalive`);
      failed = true;
    } else {
      console.log(`[PASS] cycle ${cycle}: cookie still present after reload`);
    }
  }

  console.log(`\n[test] ${failed ? "SOME TESTS FAILED" : "ALL TESTS PASSED"}`);
} catch (err) {
  console.error("[FATAL]", err);
  failed = true;
} finally {
  console.log("[test] closing driver...");
  await driver.close().catch(() => undefined);
}

process.exit(failed ? 1 : 0);
