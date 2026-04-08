# Architecture

## Goal

Provide an AI-facing browser server that works over SSH without relying on an embedded GUI webview or a manually installed browser extension.

## Shape

The project is split into three layers:

1. MCP surface
   Reuses the tool inventory from `browser-control` so the AI API does not change.
2. Bridge
   `send(action, params)` is retained, but it now targets a browser driver instead of an extension websocket.
3. Runtime driver
   The project can swap drivers. Right now it has an SSH-safe `http-fetch` inspector, a preferred Playwright runtime, and a lower-level CDP runtime.

## Why Playwright is the main path

- It already solves screenshots, clicking, typing, waiting, JS execution, and context-level cookie handling.
- It avoids rebuilding browser automation primitives in this repo.
- It gives a cleaner place to add AI-specific layers such as secret handles and normalized DOM/CSS summaries.

## Why `http-fetch` still exists

- It works without a GUI browser process.
- It lets the agent prove out page access and content inspection immediately over SSH.
- It keeps cookie handling and per-tab state simple while the higher-fidelity runtime evolves.

## Why CDP still matters

- It works cleanly in headless mode.
- It supports cookies, screenshots, DOM execution, and tab management from one websocket.
- It avoids the GUI-coupled `WebKitGTK/WKWebView` model used in `turm`.

## Current limitations

- Annotation overlays and accessibility tree extraction still need a higher-level DOM helper layer.
- Console/error streaming and dialog interception need persistent session/event routing.
- The current environment did not resolve external DNS from the sandbox, so live fetch testing needs either escalation or a reachable internal target.

## Expected deployment

1. Install or bundle a Chromium-compatible binary.
2. Run this MCP server with `BROWSER_RUNTIME=chromium-cdp` or connect to an existing CDP target with `external-cdp`.
3. Point the AI client at the MCP server over stdio.
