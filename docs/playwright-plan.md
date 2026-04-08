# Playwright Plan

## Position

Do not build a browser engine here.

Use Playwright for rendering, JS execution, input synthesis, screenshots, waiting, and cookie/context management. This repository should only add the AI-oriented control surface that Playwright does not provide directly.

## What Playwright already solves well

- page navigation
- screenshots
- element click/fill/select/check
- JS execution in page context
- network-aware waiting
- browser contexts and cookie management
- storage state export/import

## What this repo should add

### 1. Secret-safe input

Add a secret layer above Playwright instead of passing plaintext passwords through normal MCP args.

Recommended model:

- `secret_store_put(value, label?) -> secretId`
- `secret_store_delete(secretId)`
- `type_secret(selector, secretId, tabId?)`
- redact secret values from logs, errors, and traces

Storage options:

- first choice: OS keyring/libsecret/keychain
- fallback: local encrypted file with a session key

### 2. AI-oriented DOM summaries

Playwright can return raw DOM data, but the AI layer should provide:

- normalized `query_selector` results
- accessibility-ish summaries with stable refs
- concise CSS/computed-style extraction
- form state summaries

### 3. Safer session handling

Wrap Playwright storage state with:

- selective export/import
- domain scoping
- optional redaction of sensitive cookies

### 4. Stable MCP semantics

Keep the `browser-control` style tool names where possible so the agent surface remains stable across runtimes.

## Feature mapping

| Need | Playwright primitive | AI layer responsibility |
|------|----------------------|-------------------------|
| Screenshot | `page.screenshot()` | naming, redaction policy |
| Click element | `locator.click()` | selector normalization and recovery |
| CSS analysis | `locator.evaluate()` + `getComputedStyle()` | compact result formatting |
| Password input | `locator.fill()` | secret indirection and log redaction |
| Cookies | `context.cookies()` / `addCookies()` | export/import policy |
| Session restore | `storageState()` | safe filtering and replay |

## Recommendation

Build a `PlaywrightBrowserDriver` and keep `http-fetch` only as a lightweight fallback for quick page inspection when a real browser runtime is unavailable.
