import { CdpBrowserDriver } from "./runtimes/cdp.js";
import { FetchBrowserDriver } from "./runtimes/fetch.js";
import { PlaywrightBrowserDriver } from "./runtimes/playwright.js";
import type { BrowserDriver } from "./bridge.js";

export function createRuntime(): BrowserDriver {
  const runtime = process.env.BROWSER_RUNTIME ?? "playwright";

  if (runtime === "playwright") {
    return new PlaywrightBrowserDriver({
      browserName: process.env.BROWSER_NAME ?? "chromium",
      executablePath: process.env.BROWSER_EXECUTABLE,
      userDataDir: process.env.BROWSER_USER_DATA_DIR,
      headless: process.env.BROWSER_HEADLESS !== "0",
      startupTimeoutMs: process.env.BROWSER_STARTUP_TIMEOUT_MS
        ? Number(process.env.BROWSER_STARTUP_TIMEOUT_MS)
        : 30000,
      viewportWidth: process.env.BROWSER_VIEWPORT_WIDTH
        ? Number(process.env.BROWSER_VIEWPORT_WIDTH)
        : 1440,
      viewportHeight: process.env.BROWSER_VIEWPORT_HEIGHT
        ? Number(process.env.BROWSER_VIEWPORT_HEIGHT)
        : 960,
      keepaliveIntervalMs: process.env.BROWSER_KEEPALIVE_INTERVAL_MS
        ? Number(process.env.BROWSER_KEEPALIVE_INTERVAL_MS)
        : undefined,
    });
  }

  if (runtime === "http-fetch") {
    return new FetchBrowserDriver();
  }

  if (runtime === "chromium-cdp" || runtime === "external-cdp") {
    return new CdpBrowserDriver({
      mode: runtime,
      executablePath: process.env.BROWSER_EXECUTABLE,
      userDataDir: process.env.BROWSER_USER_DATA_DIR,
      debugPort: process.env.BROWSER_DEBUG_PORT
        ? Number(process.env.BROWSER_DEBUG_PORT)
        : 9222,
      headless: process.env.BROWSER_HEADLESS !== "0",
      startupTimeoutMs: process.env.BROWSER_STARTUP_TIMEOUT_MS
        ? Number(process.env.BROWSER_STARTUP_TIMEOUT_MS)
        : 15000,
    });
  }

  throw new Error(
    `Unsupported BROWSER_RUNTIME=${runtime}. Supported values: playwright, http-fetch, chromium-cdp, external-cdp`
  );
}
