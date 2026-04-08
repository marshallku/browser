import { PlaywrightBrowserDriver } from "../dist/server/runtimes/playwright.js";
import { getSecretStore } from "../dist/server/secrets.js";

const executablePath =
  process.env.BROWSER_EXECUTABLE ??
  `${process.env.HOME}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`;

const driver = new PlaywrightBrowserDriver({
  browserName: process.env.BROWSER_NAME ?? "chromium",
  executablePath,
  headless: process.env.BROWSER_HEADLESS !== "0",
  startupTimeoutMs: 30000,
  viewportWidth: 1280,
  viewportHeight: 800,
});

const store = getSecretStore();
const secret = await store.put("pw-12345", "smoke-password");

const html =
  "<!doctype html><html><body><style>button{color:rgb(255,0,0)}</style><input id=pw type=password><button id=btn onclick=window.clicked=1>Go</button></body></html>";
const url = `data:text/html,${encodeURIComponent(html)}`;

try {
  await driver.init();

  const results = {
    navigate: await driver.execute("tabs.navigate", { url }),
    typeSecret: await driver.execute("interaction.typeSecret", {
      selector: "#pw",
      secretId: secret.id,
    }),
    click: await driver.execute("interaction.click", { selector: "#btn" }),
    styles: await driver.execute("capture.computedStyles", {
      selector: "#btn",
      properties: ["color"],
    }),
    js: await driver.execute("execution.executeJs", {
      code: "({ clicked: window.clicked, pw: document.querySelector('#pw').value })",
    }),
    screenshot: await driver.execute("capture.screenshot", {}),
  };

  console.log(
    JSON.stringify(
      {
        navigateOk: results.navigate.success,
        typeSecretOk: results.typeSecret.success,
        clickOk: results.click.success,
        styleColor: results.styles.success ? results.styles.data.color : null,
        js: results.js.success ? results.js.data : null,
        screenshotOk: results.screenshot.success,
        screenshotLength: results.screenshot.success
          ? String(results.screenshot.data).length
          : 0,
      },
      null,
      2,
    ),
  );
} finally {
  await driver.close().catch(() => undefined);
  await store.delete(secret.id).catch(() => undefined);
}
