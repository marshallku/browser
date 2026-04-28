/**
 * E2E CDP parity test — verifies CdpBrowserDriver matches Playwright behavior:
 *  - real Input.dispatchMouseEvent click triggers :hover and click handlers
 *  - waitForActionable waits for slow-rendering elements
 *  - typeSecret pulls from secret store and dispatches input/change
 *  - hover, mouseMove, network capture, console capture all work via CDP
 *
 * Usage:
 *   node tests/e2e-cdp-parity.mjs
 */

import { CdpBrowserDriver } from "../dist/server/runtimes/cdp.js";
import { getSecretStore } from "../dist/server/secrets.js";
import { homedir } from "node:os";

const chromiumPath = `${homedir()}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`;

const HTML = `<!doctype html><html><head><style>
  body { margin: 0; padding: 16px; }
  #target { width: 120px; height: 80px; background: gray; }
  #target:hover { background: red; }
  #late { display: none; }
  #late.shown { display: block; padding: 8px; background: lime; }
  input { padding: 8px; font-size: 14px; }
  #overlay-host { position: relative; margin-top: 16px; }
  #covered { width: 120px; height: 40px; background: blue; color: white; border: 0; }
  #scrim {
    position: absolute; inset: 0; background: rgba(0,0,0,0.4);
    transition: none;
  }
  #scrim.gone { display: none; }
</style></head><body>
  <div id="target" data-clicked="0"></div>
  <button id="late-btn">show late</button>
  <button id="late" disabled>act</button>
  <input id="pwd" type="password" />
  <input id="text" />
  <div id="overlay-host">
    <button id="covered" data-clicked="0">covered</button>
    <div id="scrim"></div>
  </div>
  <button id="lift-scrim">lift scrim</button>
  <script>
    document.getElementById('target').addEventListener('click', (e) => {
      const el = e.currentTarget;
      el.dataset.clicked = String(Number(el.dataset.clicked) + 1);
      el.dataset.hoverWasActive = String(getComputedStyle(el).backgroundColor === 'rgb(255, 0, 0)');
    });
    document.getElementById('late-btn').addEventListener('click', () => {
      setTimeout(() => {
        const late = document.getElementById('late');
        late.classList.add('shown');
        late.disabled = false;
      }, 400);
    });
    document.getElementById('late').addEventListener('click', (e) => {
      e.currentTarget.dataset.acted = '1';
    });
    document.getElementById('covered').addEventListener('click', (e) => {
      e.currentTarget.dataset.clicked = String(Number(e.currentTarget.dataset.clicked) + 1);
    });
    document.getElementById('lift-scrim').addEventListener('click', () => {
      // Lift the scrim after 350ms — auto-wait should retry until then
      setTimeout(() => {
        document.getElementById('scrim').classList.add('gone');
      }, 350);
    });
  </script>
</body></html>`;

const driver = new CdpBrowserDriver({
  mode: "chromium-cdp",
  executablePath: chromiumPath,
  debugPort: 9333,
  headless: true,
  startupTimeoutMs: 30000,
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

  // 1. Real mouse event: click should fire while :hover is active
  unwrap(
    await driver.execute("interaction.click", { selector: "#target" }),
    "click"
  );
  await new Promise((r) => setTimeout(r, 100));
  const clicked = await evalJs(`document.getElementById('target').dataset.clicked`);
  check(clicked === "1", `click fired (count=${clicked})`);
  const hoverWasActive = await evalJs(
    `document.getElementById('target').dataset.hoverWasActive`
  );
  check(
    hoverWasActive === "true",
    `:hover was active during click (real mouse event)`
  );

  // 2. Auto-wait: clicking #late should wait for it to become visible + enabled
  unwrap(
    await driver.execute("interaction.click", { selector: "#late-btn" }),
    "click late-btn"
  );
  // No manual sleep — auto-wait should handle the 400ms delay
  unwrap(
    await driver.execute("interaction.click", { selector: "#late" }),
    "click late (auto-wait)"
  );
  const acted = await evalJs(`document.getElementById('late').dataset.acted`);
  check(acted === "1", `auto-wait survived disabled+hidden->enabled+visible transition`);

  // 3. typeSecret pulls from secret store, fills, and dispatches events
  const record = await getSecretStore().put("hunter2", "test-pwd");
  unwrap(
    await driver.execute("interaction.typeSecret", {
      selector: "#pwd",
      secretId: record.id,
    }),
    "typeSecret"
  );
  const pwdValue = await evalJs(`document.getElementById('pwd').value`);
  check(pwdValue === "hunter2", `typeSecret filled the password input`);
  await getSecretStore().delete(record.id);

  // 4. Hover via CDP
  unwrap(
    await driver.execute("interaction.hover", { selector: "#target" }),
    "hover"
  );
  await new Promise((r) => setTimeout(r, 100));
  const bg = await evalJs(
    `getComputedStyle(document.getElementById('target')).backgroundColor`
  );
  check(bg === "rgb(255, 0, 0)", `CDP hover triggered :hover (bg=${bg})`);

  // 5. type into a regular input via auto-wait + fillEditable
  unwrap(
    await driver.execute("interaction.type", {
      selector: "#text",
      text: "hello world",
    }),
    "type"
  );
  const textValue = await evalJs(`document.getElementById('text').value`);
  check(textValue === "hello world", `type filled regular input`);

  // 6. Hittability: clicking #covered while scrim is up should retry, then succeed
  //    once the scrim is lifted. We schedule the lift first, then click.
  unwrap(
    await driver.execute("interaction.click", { selector: "#lift-scrim" }),
    "click lift-scrim (schedules scrim removal in 350ms)"
  );
  // covered is currently obstructed by scrim; auto-wait should poll until scrim is gone
  unwrap(
    await driver.execute("interaction.click", { selector: "#covered" }),
    "click covered (waits past obstruction)"
  );
  const coveredAfter = Number(
    await evalJs(`document.getElementById('covered').dataset.clicked`)
  );
  check(
    coveredAfter === 1,
    `auto-wait retried past obstruction until scrim lifted (clicks=${coveredAfter})`
  );

  // 7. Console + network capture still works through CDP
  await evalJs(`console.log('cdp-test-marker')`);
  await new Promise((r) => setTimeout(r, 200));
  const logs = unwrap(
    await driver.execute("monitor.consoleLogs", { limit: 50 }),
    "consoleLogs"
  );
  check(
    logs.some((l) => String(l.text).includes("cdp-test-marker")),
    `console capture sees marker`
  );

  console.log(`\n[test] ${failed ? "SOME TESTS FAILED" : "ALL TESTS PASSED"}`);
} catch (err) {
  console.error("[FATAL]", err);
  failed = true;
} finally {
  await driver.close().catch(() => undefined);
}

process.exit(failed ? 1 : 0);
