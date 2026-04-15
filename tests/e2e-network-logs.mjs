/**
 * E2E network logs test — verifies that get_network_logs captures
 * requests made by a page and that filters work as documented.
 *
 * Usage:
 *   node tests/e2e-network-logs.mjs
 */

import { PlaywrightBrowserDriver } from "../dist/server/runtimes/playwright.js";
import { homedir } from "node:os";

const chromiumPath = `${homedir()}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`;

const driver = new PlaywrightBrowserDriver({
  browserName: "chromium",
  executablePath: chromiumPath,
  headless: true,
  startupTimeoutMs: 30000,
  viewportWidth: 1280,
  viewportHeight: 720,
});

let failed = false;
const check = (cond, label) => {
  if (cond) {
    console.log(`[PASS] ${label}`);
  } else {
    console.error(`[FAIL] ${label}`);
    failed = true;
  }
};

const unwrap = (res, action) => {
  if (!res.success) throw new Error(`${action} failed: ${res.error}`);
  return res.data;
};

try {
  await driver.init();

  // 1. Navigate and trigger extra XHR + 404
  unwrap(
    await driver.execute("tabs.navigate", {
      url: "https://httpbin.org/html",
    }),
    "tabs.navigate"
  );
  unwrap(
    await driver.execute("execution.executeJs", {
      code: `(async () => {
        await fetch('https://httpbin.org/json');
        await fetch('https://httpbin.org/status/404');
        await fetch('https://httpbin.org/post', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hello: 'world' }),
        });
        return 'done';
      })()`,
    }),
    "execution.executeJs"
  );

  // Give responses time to settle
  await new Promise((r) => setTimeout(r, 1500));

  // 2. All entries
  const all = unwrap(
    await driver.execute("monitor.networkLogs", { limit: 200 }),
    "networkLogs (all)"
  );
  check(Array.isArray(all), "response is array");
  check(all.length >= 3, `captured >=3 entries (got ${all.length})`);
  check(
    all.every((e) => typeof e.url === "string" && typeof e.method === "string"),
    "entries have url+method"
  );
  check(
    all.every((e) => !("authorization" in (e.requestHeaders ?? {}))),
    "no raw authorization header leaked"
  );
  check(
    all.every((e) => e.requestBody === null && e.responseBody === null),
    "bodies omitted by default"
  );

  // 3. Status bucket filter
  const errors = unwrap(
    await driver.execute("monitor.networkLogs", { status: "4xx" }),
    "networkLogs 4xx"
  );
  check(
    errors.some((e) => e.url.includes("/status/404") && e.status === 404),
    "4xx filter finds 404"
  );

  // 4. Method + URL pattern filter
  const posts = unwrap(
    await driver.execute("monitor.networkLogs", {
      method: "POST",
      urlPattern: "/post",
    }),
    "networkLogs POST /post"
  );
  check(
    posts.length >= 1 && posts.every((e) => e.method === "POST"),
    "method+urlPattern filter works"
  );

  // 5. includeBody returns a body for JSON endpoint
  const withBody = unwrap(
    await driver.execute("monitor.networkLogs", {
      urlPattern: "/json$",
      includeBody: true,
    }),
    "networkLogs /json includeBody"
  );
  const jsonEntry = withBody.find((e) => e.url.endsWith("/json"));
  check(
    jsonEntry && typeof jsonEntry.responseBody === "string" && jsonEntry.responseBody.length > 0,
    "response body captured for text/json"
  );

  // 6. Exact status number filter
  const ok = unwrap(
    await driver.execute("monitor.networkLogs", { status: 200, limit: 500 }),
    "networkLogs status=200"
  );
  check(
    ok.every((e) => e.status === 200),
    "exact status=200 filter"
  );

  console.log(`\n[test] ${failed ? "SOME TESTS FAILED" : "ALL TESTS PASSED"}`);
} catch (err) {
  console.error("[FATAL]", err);
  failed = true;
} finally {
  await driver.close().catch(() => undefined);
}

process.exit(failed ? 1 : 0);
