import { readFile } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PlaywrightBrowserDriver } from "../dist/server/runtimes/playwright.js";
import { getSecretStore } from "../dist/server/secrets.js";

function parseArgs(argv) {
  const args = {
    url: "",
    fills: [],
    secretFills: [],
    waits: [],
    clicks: [],
    screenshot: "",
    timeout: 30000,
    headless: process.env.BROWSER_HEADLESS !== "0",
    browserName: process.env.BROWSER_NAME ?? "chromium",
    executablePath:
      process.env.BROWSER_EXECUTABLE ??
      `${process.env.HOME}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--url":
        args.url = next ?? "";
        i += 1;
        break;
      case "--fill":
        args.fills.push(parseAssignment(next, "--fill"));
        i += 1;
        break;
      case "--fill-secret":
        args.secretFills.push(parseAssignment(next, "--fill-secret"));
        i += 1;
        break;
      case "--click":
        args.clicks.push(next ?? "");
        i += 1;
        break;
      case "--wait-for":
        args.waits.push(next ?? "");
        i += 1;
        break;
      case "--screenshot":
        args.screenshot = next ?? "";
        i += 1;
        break;
      case "--timeout":
        args.timeout = Number(next ?? 30000);
        i += 1;
        break;
      case "--headed":
        args.headless = false;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.url) {
    throw new Error("--url is required");
  }

  return args;
}

function parseAssignment(value, flag) {
  if (!value) {
    throw new Error(`${flag} requires selector=value`);
  }
  const idx = value.indexOf("=");
  if (idx <= 0) {
    throw new Error(`${flag} must be in selector=value form`);
  }
  return {
    selector: value.slice(0, idx),
    value: value.slice(idx + 1),
  };
}

function printHelp() {
  console.log(`Usage:
  fill-and-submit.sh --url URL [options]

Options:
  --fill selector=value
  --fill-secret selector=env:VAR
  --fill-secret selector=file:/path/to/file
  --fill-secret selector=secret:SECRET_ID
  --click selector
  --wait-for selector
  --screenshot /tmp/out.png
  --timeout 30000
  --headed
`);
}

async function resolveSecretValue(spec) {
  if (spec.startsWith("env:")) {
    const name = spec.slice(4);
    const value = process.env[name];
    if (value == null) {
      throw new Error(`Missing environment variable: ${name}`);
    }
    return value;
  }
  if (spec.startsWith("file:")) {
    const path = spec.slice(5);
    return (await readFile(path, "utf8")).replace(/\r?\n$/, "");
  }
  if (spec.startsWith("secret:")) {
    const id = spec.slice(7);
    return await getSecretStore().get(id);
  }
  throw new Error(
    `Unsupported secret source: ${spec}. Use env:NAME, file:/path, or secret:ID`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const driver = new PlaywrightBrowserDriver({
    browserName: args.browserName,
    executablePath: args.executablePath,
    headless: args.headless,
    startupTimeoutMs: args.timeout,
    viewportWidth: 1440,
    viewportHeight: 960,
  });

  const summary = {
    url: args.url,
    fills: args.fills.length,
    secretFills: args.secretFills.length,
    clicks: args.clicks.length,
    waits: args.waits.length,
    screenshot: args.screenshot || null,
    finalUrl: null,
    title: null,
  };

  try {
    await driver.init();
    await driver.execute("tabs.navigate", { url: args.url });

    for (const fill of args.fills) {
      const res = await driver.execute("interaction.type", {
        selector: fill.selector,
        text: fill.value,
      });
      if (!res.success) {
        throw new Error(res.error);
      }
    }

    for (const fill of args.secretFills) {
      const plaintext = await resolveSecretValue(fill.value);
      const secret = await getSecretStore().put(plaintext, fill.selector);
      try {
        const res = await driver.execute("interaction.typeSecret", {
          selector: fill.selector,
          secretId: secret.id,
        });
        if (!res.success) {
          throw new Error(res.error);
        }
      } finally {
        await getSecretStore().delete(secret.id).catch(() => undefined);
      }
    }

    for (const selector of args.waits) {
      const res = await driver.execute("wait.selector", {
        selector,
        visible: true,
        timeout: args.timeout,
      });
      if (!res.success) {
        throw new Error(res.error);
      }
    }

    for (const selector of args.clicks) {
      const res = await driver.execute("interaction.click", { selector });
      if (!res.success) {
        throw new Error(res.error);
      }
    }

    await driver.execute("wait.navigation", { timeout: args.timeout }).catch(
      () => undefined,
    );

    const metrics = await driver.execute("capture.metrics", {});
    if (metrics.success && metrics.data) {
      summary.finalUrl = metrics.data.url ?? null;
      summary.title = metrics.data.title ?? null;
    }

    if (args.screenshot) {
      const shot = await driver.execute("capture.screenshot", {});
      if (!shot.success) {
        throw new Error(shot.error);
      }
      const base64 = String(shot.data).replace(/^data:image\/png;base64,/, "");
      const target = resolve(args.screenshot);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(base64, "base64"));
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await driver.close().catch(() => undefined);
  }
}

await main();
