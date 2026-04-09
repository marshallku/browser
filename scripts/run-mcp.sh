#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_CHROMIUM="${HOME}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome"

export BROWSER_RUNTIME="${BROWSER_RUNTIME:-playwright}"
export BROWSER_NAME="${BROWSER_NAME:-chromium}"
export BROWSER_HEADLESS="${BROWSER_HEADLESS:-1}"

if [[ -z "${BROWSER_EXECUTABLE:-}" && -x "${DEFAULT_CHROMIUM}" ]]; then
  export BROWSER_EXECUTABLE="${DEFAULT_CHROMIUM}"
fi

exec node "${ROOT_DIR}/bin/ai-browser.js"
