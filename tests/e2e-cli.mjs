/**
 * E2E CLI test — verifies the daemon + CLI dispatcher end-to-end.
 *  - daemon auto-spawns on first command
 *  - subcommands map to bridge actions and return data
 *  - --json emits machine-readable output
 *  - daemon survives across multiple invocations and shares state
 *  - daemon stop cleans up
 *
 * Usage:
 *   node tests/e2e-cli.mjs
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = dirname(here);
const bin = join(repo, "bin", "ai-browser.js");
const chromiumPath = `${homedir()}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`;

const runtimeDir = mkdtempSync(join(tmpdir(), "ai-browser-cli-"));

let failed = false;
const check = (cond, label) => {
  if (cond) console.log(`[PASS] ${label}`);
  else { console.error(`[FAIL] ${label}`); failed = true; }
};

const cli = (...args) =>
  spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: runtimeDir,
      BROWSER_RUNTIME: "playwright",
      BROWSER_HEADLESS: "1",
      BROWSER_EXECUTABLE: chromiumPath,
    },
    timeout: 60_000,
  });

const ensureClean = () => {
  // Stop any leftover daemon and remove socket artifacts
  cli("daemon", "stop");
  const sock = join(runtimeDir, "ai-browser", "daemon.sock");
  const pid = join(runtimeDir, "ai-browser", "daemon.pid");
  if (existsSync(sock)) rmSync(sock, { force: true });
  if (existsSync(pid)) rmSync(pid, { force: true });
};

try {
  ensureClean();

  // 1. Status reports stopped
  let r = cli("daemon", "status");
  check(r.stdout.includes("status : stopped"), "status reports stopped");

  // 2. First subcommand auto-spawns the daemon
  r = cli("navigate", "https://example.com", "--json");
  check(r.status === 0, `navigate succeeded (status=${r.status})`);

  // 3. Daemon is now alive
  r = cli("daemon", "status");
  check(r.stdout.includes("status : running"), "daemon is running after auto-spawn");

  // 4. Get text shows page content (state shared across CLI calls)
  r = cli("get-text", "--selector", "h1");
  check(/Example Domain/i.test(r.stdout), "shared state: get-text sees navigated page");

  // 5. Eval returns a value as JSON
  r = cli("eval", "document.title", "--json");
  const evalOut = r.stdout.trim();
  check(
    evalOut === '"Example Domain"',
    `eval --json returns scalar JSON (got ${evalOut})`
  );

  // 6. List tabs returns array
  r = cli("list-tabs", "--json");
  let tabs;
  try { tabs = JSON.parse(r.stdout); } catch {}
  check(Array.isArray(tabs) && tabs.length >= 1, `list-tabs returns array (len=${tabs?.length})`);

  // 7. Network logs contain the navigation
  r = cli("network-logs", "--limit", "100", "--json");
  let netLogs;
  try { netLogs = JSON.parse(r.stdout); } catch {}
  check(
    Array.isArray(netLogs) && netLogs.some((e) => e.url?.includes("example.com")),
    `network-logs captured the navigation`
  );

  // 8. Unknown subcommand returns non-zero
  r = cli("definitely-not-a-command");
  check(r.status === 2, `unknown subcommand exits 2 (got ${r.status})`);

  // 9. Daemon stop terminates it
  cli("daemon", "stop");
  // Give the daemon a moment to shut down
  spawnSync("sleep", ["0.4"]);
  r = cli("daemon", "status");
  check(r.stdout.includes("status : stopped"), "daemon stops cleanly");

  console.log(`\n[test] ${failed ? "SOME TESTS FAILED" : "ALL TESTS PASSED"}`);
} catch (err) {
  console.error("[FATAL]", err);
  failed = true;
} finally {
  ensureClean();
  rmSync(runtimeDir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
