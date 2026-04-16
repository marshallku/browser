#!/usr/bin/env bash
# install.sh — One-shot installer for ai-browser MCP server.
#
# Steps (in order):
#   1. npm install            (skipped with --skip-install or if node_modules is fresh)
#   2. playwright chromium    (skipped if --runtime=chromium-cdp or already cached)
#   3. npm run build          (skipped with --skip-build or if dist is up to date)
#   4. patch MCP config       (claude / codex / both)
#
# Usage:
#   ./scripts/install.sh                       # both targets, playwright runtime
#   ./scripts/install.sh --target claude
#   ./scripts/install.sh --target codex --name my-browser
#   ./scripts/install.sh --runtime chromium-cdp --headless 0
#   ./scripts/install.sh --dry-run             # print plan, no writes
#
# Flags:
#   --target <claude|codex|both>   default: both (only patches files that exist
#                                  or whose parent directory exists)
#   --runtime <playwright|chromium-cdp>   default: playwright
#   --headless <0|1>               default: 1
#   --executable <path>            override chromium binary
#   --user-data-dir <path>         persistent profile directory
#   --name <key>                   MCP server key (default: ai-browser)
#   --skip-install                 skip "npm install"
#   --skip-build                   skip "npm run build"
#   --dry-run                      do not write or run anything that mutates state
#   -h | --help                    show this help

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

TARGET="both"
RUNTIME="playwright"
HEADLESS="1"
EXECUTABLE=""
USER_DATA_DIR=""
NAME="ai-browser"
SKIP_INSTALL=0
SKIP_BUILD=0
DRY_RUN=0

usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

log()  { printf '\033[36m[install]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[install]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[install]\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)         TARGET="$2"; shift 2 ;;
    --runtime)        RUNTIME="$2"; shift 2 ;;
    --headless)       HEADLESS="$2"; shift 2 ;;
    --executable)     EXECUTABLE="$2"; shift 2 ;;
    --user-data-dir)  USER_DATA_DIR="$2"; shift 2 ;;
    --name)           NAME="$2"; shift 2 ;;
    --skip-install)   SKIP_INSTALL=1; shift ;;
    --skip-build)     SKIP_BUILD=1; shift ;;
    --dry-run)        DRY_RUN=1; shift ;;
    -h|--help)        usage ;;
    *)                die "unknown flag: $1" ;;
  esac
done

case "$TARGET" in
  claude|codex|both) ;;
  *) die "--target must be claude, codex, or both (got '$TARGET')" ;;
esac

case "$RUNTIME" in
  playwright|chromium-cdp) ;;
  *) die "--runtime must be playwright or chromium-cdp (got '$RUNTIME')" ;;
esac

case "$HEADLESS" in
  0|1) ;;
  *) die "--headless must be 0 or 1 (got '$HEADLESS')" ;;
esac

cd "$ROOT_DIR"

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] $*"
  else
    log "$*"
    "$@"
  fi
}

# ----- 1. npm install -----
if [[ "$SKIP_INSTALL" -eq 1 ]]; then
  log "step 1/4: skipping npm install (--skip-install)"
elif [[ -d node_modules && package-lock.json -ot node_modules ]]; then
  log "step 1/4: node_modules is up to date, skipping npm install"
else
  log "step 1/4: installing npm dependencies"
  run npm install
fi

# ----- 2. playwright chromium -----
PLAYWRIGHT_CACHE="${HOME}/.cache/ms-playwright"
chromium_present() {
  compgen -G "${PLAYWRIGHT_CACHE}/chromium-*/chrome-linux*/chrome" >/dev/null 2>&1 \
    || compgen -G "${PLAYWRIGHT_CACHE}/chromium-*/chrome-mac*/Chromium.app" >/dev/null 2>&1
}

if [[ "$RUNTIME" != "playwright" ]]; then
  log "step 2/4: runtime is '$RUNTIME', skipping playwright chromium download"
elif chromium_present; then
  log "step 2/4: playwright chromium already cached, skipping download"
else
  log "step 2/4: installing playwright chromium (this may take a minute)"
  run npx --yes playwright install chromium
fi

# Resolve executable (best-effort): prefer first cached Linux build.
if [[ -z "$EXECUTABLE" ]]; then
  for candidate in "${PLAYWRIGHT_CACHE}"/chromium-*/chrome-linux*/chrome; do
    if [[ -x "$candidate" ]]; then EXECUTABLE="$candidate"; break; fi
  done
fi

# ----- 3. npm run build -----
needs_build() {
  [[ ! -d dist ]] && return 0
  local newest_src newest_dist
  newest_src=$(find src -type f -newer dist -print -quit 2>/dev/null || true)
  [[ -n "$newest_src" ]]
}

if [[ "$SKIP_BUILD" -eq 1 ]]; then
  log "step 3/4: skipping build (--skip-build)"
elif needs_build; then
  log "step 3/4: building (npm run build)"
  run npm run build
else
  log "step 3/4: dist is up to date, skipping build"
fi

# ----- 4. patch MCP config -----
RUN_SCRIPT="${ROOT_DIR}/scripts/run-mcp.sh"
[[ -x "$RUN_SCRIPT" ]] || die "run-mcp.sh missing or not executable: $RUN_SCRIPT"

# Build env JSON for both patchers via Node (handles escaping).
ENV_JSON=$(BROWSER_RUNTIME="$RUNTIME" \
           BROWSER_HEADLESS="$HEADLESS" \
           BROWSER_EXECUTABLE="$EXECUTABLE" \
           BROWSER_USER_DATA_DIR="$USER_DATA_DIR" \
           node -e '
const out = {
  BROWSER_RUNTIME: process.env.BROWSER_RUNTIME,
  BROWSER_HEADLESS: process.env.BROWSER_HEADLESS,
};
if (process.env.BROWSER_EXECUTABLE) out.BROWSER_EXECUTABLE = process.env.BROWSER_EXECUTABLE;
if (process.env.BROWSER_USER_DATA_DIR) out.BROWSER_USER_DATA_DIR = process.env.BROWSER_USER_DATA_DIR;
process.stdout.write(JSON.stringify(out));
')

backup_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  local stamp
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] backup $f -> ${f}.bak.${stamp}"
  else
    cp -p "$f" "${f}.bak.${stamp}"
    log "backed up $f -> ${f}.bak.${stamp}"
  fi
}

patch_claude() {
  local cfg="${HOME}/.claude.json"
  log "step 4/4: patching Claude config (${cfg})"
  backup_file "$cfg"
  CLAUDE_CFG="$cfg" CLAUDE_NAME="$NAME" CLAUDE_CMD="$RUN_SCRIPT" \
  CLAUDE_ENV="$ENV_JSON" CLAUDE_DRY="$DRY_RUN" \
  node -e '
const fs = require("node:fs");
const path = process.env.CLAUDE_CFG;
const name = process.env.CLAUDE_NAME;
const dry  = process.env.CLAUDE_DRY === "1";
const env  = JSON.parse(process.env.CLAUDE_ENV);
let json = {};
try { json = JSON.parse(fs.readFileSync(path, "utf8")); } catch { /* new file */ }
json.mcpServers = json.mcpServers || {};
json.mcpServers[name] = {
  type: "stdio",
  command: process.env.CLAUDE_CMD,
  args: [],
  env,
};
const out = JSON.stringify(json, null, 2) + "\n";
if (dry) {
  console.log("[dry-run] would write " + path);
  console.log(JSON.stringify({mcpServers:{[name]:json.mcpServers[name]}}, null, 2));
} else {
  fs.mkdirSync(require("node:path").dirname(path), { recursive: true });
  fs.writeFileSync(path, out);
  console.log("[install] wrote mcpServers." + name + " to " + path);
}
'
}

patch_codex() {
  local cfg="${HOME}/.codex/config.toml"
  log "step 4/4: patching Codex config (${cfg})"
  backup_file "$cfg"
  CODEX_CFG="$cfg" CODEX_NAME="$NAME" CODEX_CMD="$RUN_SCRIPT" \
  CODEX_ENV="$ENV_JSON" CODEX_DRY="$DRY_RUN" \
  node -e '
const fs = require("node:fs");
const path = process.env.CODEX_CFG;
const name = process.env.CODEX_NAME;
const dry  = process.env.CODEX_DRY === "1";
const env  = JSON.parse(process.env.CODEX_ENV);
let text = "";
try { text = fs.readFileSync(path, "utf8"); } catch {}
const tomlString = (s) => "\"" + String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"";
const sectionLines = [];
sectionLines.push("[mcp_servers." + name + "]");
sectionLines.push("command = " + tomlString(process.env.CODEX_CMD));
const envKeys = Object.keys(env);
if (envKeys.length > 0) {
  sectionLines.push("");
  sectionLines.push("[mcp_servers." + name + ".env]");
  for (const k of envKeys) sectionLines.push(k + " = " + tomlString(env[k]));
}
const block = sectionLines.join("\n") + "\n";

const sectionRe = new RegExp(
  "(^|\\n)\\[mcp_servers\\." + name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&") +
  "(\\..+)?\\][^\\n]*\\n([^\\[]*?)(?=\\n\\[|\\s*$)",
  "g"
);
let updated;
if (sectionRe.test(text)) {
  updated = text.replace(sectionRe, "");
  updated = updated.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") + "\n\n" + block;
} else {
  updated = (text.replace(/\s+$/, "") + (text ? "\n\n" : "") + block);
}
if (dry) {
  console.log("[dry-run] would write " + path);
  console.log(block);
} else {
  fs.mkdirSync(require("node:path").dirname(path), { recursive: true });
  fs.writeFileSync(path, updated);
  console.log("[install] wrote [mcp_servers." + name + "] to " + path);
}
'
}

case "$TARGET" in
  claude) patch_claude ;;
  codex)  patch_codex ;;
  both)
    patch_claude
    patch_codex
    ;;
esac

log "done."
log "MCP server name: $NAME"
log "command:         $RUN_SCRIPT"
[[ -n "$EXECUTABLE" ]] && log "chromium:        $EXECUTABLE"
log "next: restart your client (Claude Code / Codex) so it re-reads the config"
