/**
 * E2E installer test — verifies scripts/install.sh patches Claude / Codex
 * MCP configs correctly inside an isolated HOME directory.
 *
 * Usage:
 *   node tests/e2e-installer.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = dirname(here);
const installer = join(repo, "scripts", "install.sh");

let failed = false;
const check = (cond, label) => {
  if (cond) console.log(`[PASS] ${label}`);
  else { console.error(`[FAIL] ${label}`); failed = true; }
};

const run = (home, args, env = {}) =>
  execFileSync("bash", [installer, "--skip-install", "--skip-build", ...args], {
    env: { ...process.env, HOME: home, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const makeHome = () => {
  const home = mkdtempSync(join(tmpdir(), "ai-browser-install-"));
  mkdirSync(join(home, ".codex"), { recursive: true });
  return home;
};

const claudePath = (home) => join(home, ".claude.json");
const codexPath  = (home) => join(home, ".codex", "config.toml");

try {
  // 1. Dry-run does not write
  {
    const home = makeHome();
    const out = run(home, ["--dry-run", "--target", "both"]);
    check(out.includes("[dry-run]"), "dry-run announces itself");
    check(!readdirSync(home).includes(".claude.json"), "dry-run leaves claude config absent");
    let codexText = "";
    try { codexText = readFileSync(codexPath(home), "utf8"); } catch {}
    check(!codexText.includes("[mcp_servers."), "dry-run leaves codex config untouched");
    rmSync(home, { recursive: true, force: true });
  }

  // 2. Real run creates Claude config from scratch
  {
    const home = makeHome();
    run(home, ["--target", "claude"]);
    const j = JSON.parse(readFileSync(claudePath(home), "utf8"));
    check(j.mcpServers?.["ai-browser"]?.command?.endsWith("scripts/run-mcp.sh"),
          "claude config has command pointing at run-mcp.sh");
    check(j.mcpServers["ai-browser"].type === "stdio", "claude entry is stdio");
    check(j.mcpServers["ai-browser"].env?.BROWSER_RUNTIME === "playwright",
          "claude entry has BROWSER_RUNTIME=playwright");
    rmSync(home, { recursive: true, force: true });
  }

  // 3. Real run patches existing Codex config without clobbering other entries
  {
    const home = makeHome();
    const existing = `[projects."/some/proj"]
trust_level = "trusted"

[mcp_servers.other]
command = "/usr/local/bin/other"

[mcp_servers.ai-browser]
command = "/old/path"
`;
    writeFileSync(codexPath(home), existing);
    run(home, ["--target", "codex", "--headless", "0"]);
    const toml = readFileSync(codexPath(home), "utf8");
    check(toml.includes("[mcp_servers.other]"), "codex preserves unrelated mcp_servers entry");
    check(toml.includes("[projects.\"/some/proj\"]"), "codex preserves projects table");
    check(toml.includes("[mcp_servers.ai-browser]"), "codex has new ai-browser section");
    check(toml.includes("scripts/run-mcp.sh"), "codex command updated to run-mcp.sh");
    check(!toml.includes("/old/path"), "codex old command was removed");
    check(toml.includes("BROWSER_HEADLESS = \"0\""), "codex env reflects --headless 0");
    rmSync(home, { recursive: true, force: true });
  }

  // 4. Idempotent: running twice produces same content (modulo backups), creates backup file
  {
    const home = makeHome();
    run(home, ["--target", "claude"]);
    const first = readFileSync(claudePath(home), "utf8");
    run(home, ["--target", "claude"]);
    const second = readFileSync(claudePath(home), "utf8");
    check(first === second, "claude config is idempotent across re-runs");
    const backups = readdirSync(home).filter((f) => f.startsWith(".claude.json.bak."));
    check(backups.length >= 1, `backup file created (found ${backups.length})`);
    rmSync(home, { recursive: true, force: true });
  }

  // 5. Custom name flag
  {
    const home = makeHome();
    run(home, ["--target", "claude", "--name", "browser-2"]);
    const j = JSON.parse(readFileSync(claudePath(home), "utf8"));
    check(!!j.mcpServers?.["browser-2"], "custom --name registers under that key");
    check(!j.mcpServers?.["ai-browser"], "default key is not added when --name overridden");
    rmSync(home, { recursive: true, force: true });
  }

  console.log(`\n[test] ${failed ? "SOME TESTS FAILED" : "ALL TESTS PASSED"}`);
} catch (err) {
  console.error("[FATAL]", err.stdout?.toString() ?? "", err.stderr?.toString() ?? "", err);
  failed = true;
}

process.exit(failed ? 1 : 0);
