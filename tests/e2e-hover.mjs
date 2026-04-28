/**
 * E2E hover/mouse_move test — verifies that interaction.hover triggers
 * CSS :hover styles and pointer events, and that mouseMove dispatches.
 *
 * Usage:
 *   node tests/e2e-hover.mjs
 */

import { PlaywrightBrowserDriver } from "../dist/server/runtimes/playwright.js";
import { homedir } from "node:os";

const chromiumPath = `${homedir()}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`;

const HTML = `<!doctype html><html><head><style>
  #target { width: 120px; height: 80px; background: gray; }
  #target:hover { background: red; }
  #tip { display: none; }
  #target:hover + #tip { display: block; }
</style></head><body>
  <div id="target" data-state="idle"></div>
  <div id="tip">tooltip-visible</div>
  <div id="trail" data-x="" data-y=""></div>
  <script>
    const t = document.getElementById('target');
    t.addEventListener('mouseenter', () => t.dataset.state = 'entered');
    t.addEventListener('mouseleave', () => t.dataset.state = 'left');
    document.addEventListener('mousemove', (e) => {
      const trail = document.getElementById('trail');
      trail.dataset.x = String(e.clientX);
      trail.dataset.y = String(e.clientY);
    });
  </script>
</body></html>`;

const driver = new PlaywrightBrowserDriver({
  browserName: "chromium",
  executablePath: chromiumPath,
  headless: true,
  startupTimeoutMs: 30000,
  viewportWidth: 800,
  viewportHeight: 600,
});

let failed = false;
const check = (cond, label) => {
  if (cond) console.log(`[PASS] ${label}`);
  else { console.error(`[FAIL] ${label}`); failed = true; }
};
const unwrap = (res, action) => {
  if (!res.success) throw new Error(`${action} failed: ${res.error}`);
  return res.data;
};
const evalJs = async (code) =>
  unwrap(await driver.execute("execution.executeJs", { code }), "executeJs");

try {
  await driver.init();
  unwrap(
    await driver.execute("tabs.navigate", {
      url: `data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`,
    }),
    "navigate"
  );

  // 1. baseline: not hovered
  const initialState = await evalJs(
    `document.getElementById('target').dataset.state`
  );
  check(initialState === "idle", "initial state is idle");

  // 2. hover triggers mouseenter + CSS :hover
  unwrap(
    await driver.execute("interaction.hover", { selector: "#target" }),
    "hover"
  );
  await new Promise((r) => setTimeout(r, 150));
  const afterHover = await evalJs(
    `document.getElementById('target').dataset.state`
  );
  check(afterHover === "entered", `mouseenter fired after hover (got ${afterHover})`);

  const tipDisplay = await evalJs(
    `getComputedStyle(document.getElementById('tip')).display`
  );
  check(tipDisplay === "block", `CSS :hover sibling shown (display=${tipDisplay})`);

  const bg = await evalJs(
    `getComputedStyle(document.getElementById('target')).backgroundColor`
  );
  check(bg === "rgb(255, 0, 0)", `CSS :hover applied (background=${bg})`);

  // 3. mouse_move to far coords leaves the element
  unwrap(
    await driver.execute("interaction.mouseMove", { x: 700, y: 500 }),
    "mouseMove away"
  );
  await new Promise((r) => setTimeout(r, 150));
  const afterLeave = await evalJs(
    `document.getElementById('target').dataset.state`
  );
  check(afterLeave === "left", `mouseleave fired after move away (got ${afterLeave})`);

  const trailX = await evalJs(
    `document.getElementById('trail').dataset.x`
  );
  const trailY = await evalJs(
    `document.getElementById('trail').dataset.y`
  );
  check(Number(trailX) === 700 && Number(trailY) === 500,
    `mousemove coordinates recorded (x=${trailX}, y=${trailY})`);

  // 4. press_key chord support — focus the body and press Ctrl+A
  await evalJs(`document.body.setAttribute('tabindex','0'); document.body.focus(); window.__chord = ''; document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key.toLowerCase() === 'a') window.__chord = 'ctrl+a'; });`);
  unwrap(
    await driver.execute("interaction.pressKey", { key: "Control+a" }),
    "pressKey chord"
  );
  await new Promise((r) => setTimeout(r, 100));
  const chord = await evalJs(`window.__chord`);
  check(chord === "ctrl+a", `Control+a chord delivered (got '${chord}')`);

  console.log(`\n[test] ${failed ? "SOME TESTS FAILED" : "ALL TESTS PASSED"}`);
} catch (err) {
  console.error("[FATAL]", err);
  failed = true;
} finally {
  await driver.close().catch(() => undefined);
}

process.exit(failed ? 1 : 0);
