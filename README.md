# AI Browser

SSH-friendly headless browser MCP server for AI agents.

Replaces `browser-control`'s WebExtension bridge with direct control. No display, no extension, no interactive session required.

The intended long-term engine is Playwright. The browser engine itself should not be reinvented here; this repo should focus on the AI-facing layer on top of it.

## Features

All 44 MCP tools from `browser-control`:

| Category | Tools | http-fetch | CDP |
|----------|-------|:----------:|:---:|
| **Tabs** | list, open, close, navigate, activate, back, forward, reload | partial | full |
| **DOM** | getHtml, getText, querySelector, formValues, accessibilityTree | partial | full |
| **Interaction** | click, type, scroll, pressKey, selectOption, check, annotations | - | full |
| **Capture** | screenshot, computedStyles, elementRect, metrics, annotate, highlight | metrics only | full |
| **Execution** | executeJs | - | full |
| **Wait** | selector, navigation, networkIdle | - | full |
| **Cookies** | get, set, delete | full | full |
| **Storage** | get, set, clear + session save/restore | full | full |
| **Dialog** | setBehavior, getLast | - | full |
| **Monitor** | consoleLogs, pageErrors | - | full |

## Architecture

```
MCP Client (Claude Code, etc.)
    | stdio
AI Browser MCP Server
    | BrowserDriver interface
    |
    +-- FetchBrowserDriver (http-fetch)      -- just fetch() + HTML parsing
    +-- PlaywrightBrowserDriver (planned)    -- preferred full browser runtime
    +-- CdpBrowserDriver (chromium-cdp)      -- lower-level fallback/runtime experiment
```

### Preferred Playwright runtime

- `page.goto`, `locator.click`, `locator.fill`, `page.screenshot`
- browser context level cookie/session control
- automatic waiting and more robust selector handling than raw CDP
- easier support for Chromium, Firefox, and WebKit when needed
- extra MCP tools for secrets: `secret_store_put`, `secret_store_delete`, `type_secret`

### AI-specific features to layer on top

- secret handles for passwords and tokens so the model never has to echo raw values back
- redacted logging for `fill`/`type` operations on sensitive fields
- session import/export that can include cookies and selected storage keys
- DOM/CSS inspection helpers that normalize output for model consumption

### CDP runtime specifics

- **Persistent sessions** per tab (attach once, keep Runtime/Page/Network/DOM enabled)
- **Event capture** — console logs, JS errors, dialog events, network activity tracked per tab
- **Key synthesis** via `Input.dispatchKeyEvent`
- **Accessibility tree** built from DOM walk with ref-based annotation system

## Setup

```bash
# Install a Chromium-compatible browser (for CDP mode)
sudo pacman -S chromium  # Arch
sudo apt install chromium-browser  # Debian/Ubuntu

# Install dependencies & build
npm install && npm run build
```

## Usage

### MCP server config (Claude Code)

```json
{
    "mcpServers": {
        "browser": {
            "command": "node",
            "args": ["/path/to/browser/dist/server/index.js"],
            "env": { "BROWSER_RUNTIME": "chromium-cdp" }
        }
    }
}
```

### Development

```bash
npm run dev
npm run build
npm run smoke:playwright
```

## Modes

| Mode | `BROWSER_RUNTIME` | Description |
|------|-------------------|-------------|
| Playwright | `playwright` | Preferred full browser runtime |
| HTTP fetch | `http-fetch` (default) | No browser process — fetch pages via HTTP, inspect HTML |
| Local Chromium | `chromium-cdp` | Launch headless Chromium with full browser control |
| External CDP | `external-cdp` | Connect to an already-running browser |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BROWSER_RUNTIME` | `playwright` | Runtime mode |
| `BROWSER_NAME` | `chromium` | Playwright browser type: chromium, firefox, webkit |
| `BROWSER_EXECUTABLE` | auto-detect | Path to Chromium binary |
| `BROWSER_DEBUG_PORT` | `9222` | CDP port |
| `BROWSER_HEADLESS` | `1` | Set `0` to show the browser window |
| `BROWSER_USER_DATA_DIR` | (temp) | Persistent profile directory |
| `BROWSER_STARTUP_TIMEOUT_MS` | `15000` | Browser launch timeout |

## Notes

- In this Codex sandbox, Chromium launch required escalated permissions to pass the runtime smoke test.
- The checked smoke path used the cached Playwright Chromium binary at `~/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`.
