import { existsSync } from "node:fs";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type BrowserType,
  type ConsoleMessage,
  type Dialog,
  type LaunchOptions,
  type Page,
} from "playwright-core";
import type { BridgeAction, BridgeResponse } from "../../shared/protocol.js";
import type { BrowserDriver } from "../bridge.js";
import { getSecretStore } from "../secrets.js";

interface PlaywrightOptions {
  browserName: string;
  executablePath?: string;
  userDataDir?: string;
  headless: boolean;
  startupTimeoutMs: number;
  viewportWidth: number;
  viewportHeight: number;
}

interface PageState {
  consoleLogs: Array<Record<string, unknown>>;
  pageErrors: Array<Record<string, unknown>>;
  dialogBehavior: { action: "accept" | "dismiss"; text?: string };
  lastDialog: Record<string, unknown> | null;
}

const MAX_LOG_ENTRIES = 200;

export class PlaywrightBrowserDriver implements BrowserDriver {
  private readonly options: PlaywrightOptions;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private activeTabId: number | null = null;
  private readonly pageStates = new Map<Page, PageState>();
  private readonly secrets = getSecretStore();

  constructor(options: PlaywrightOptions) {
    this.options = options;
  }

  async init(): Promise<void> {
    const browserType = this.resolveBrowserType();
    const launchOptions: LaunchOptions = {
      headless: this.options.headless,
      executablePath: this.resolveExecutablePath(),
      timeout: this.options.startupTimeoutMs,
    };

    this.browser = await browserType.launch(launchOptions);
    this.context = await this.browser.newContext({
      viewport: {
        width: this.options.viewportWidth,
        height: this.options.viewportHeight,
      },
    });

    this.context.on("page", (page) => this.attachPage(page));

    const page = await this.context.newPage();
    this.attachPage(page);
    this.activeTabId = this.tabIdForPage(page);
  }

  async close(): Promise<void> {
    this.pageStates.clear();
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
    this.activeTabId = null;
  }

  async execute(
    action: BridgeAction,
    params: Record<string, unknown>,
  ): Promise<BridgeResponse> {
    const id = crypto.randomUUID();
    try {
      const data = await this.dispatch(action, params);
      return { id, success: true, data };
    } catch (error) {
      return {
        id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async dispatch(
    action: BridgeAction,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    switch (action) {
      case "tabs.list":
        return this.listTabs();
      case "tabs.open":
        return this.openTab(String(params.url ?? "about:blank"));
      case "tabs.close":
        return this.closeTab(this.requirePage(params));
      case "tabs.navigate":
        return this.navigate(this.getPage(params), String(params.url ?? ""));
      case "tabs.activate":
        return this.activateTab(this.requirePage(params));
      case "tabs.goBack":
        return this.goBack(this.getPage(params));
      case "tabs.goForward":
        return this.goForward(this.getPage(params));
      case "tabs.reload":
        return this.reload(this.getPage(params));
      case "dom.getHtml":
        return this.getHtml(params);
      case "dom.getText":
        return this.getText(params);
      case "dom.querySelector":
        return this.querySelector(params);
      case "dom.formValues":
        return this.getFormValues(params);
      case "dom.accessibilityTree":
        return this.getAccessibilityTree(params);
      case "interaction.click":
        return this.click(params);
      case "interaction.type":
        return this.typeText(params);
      case "interaction.typeSecret":
        return this.typeSecret(params);
      case "interaction.scroll":
        return this.scroll(params);
      case "interaction.pressKey":
        return this.pressKey(params);
      case "interaction.selectOption":
        return this.selectOption(params);
      case "interaction.check":
        return this.check(params);
      case "interaction.clickAnnotation":
        return this.clickAnnotation(params);
      case "interaction.typeAnnotation":
        return this.typeAnnotation(params);
      case "capture.screenshot":
        return this.captureScreenshot(params);
      case "capture.computedStyles":
        return this.getComputedStyles(params);
      case "capture.elementRect":
        return this.getElementRect(params);
      case "capture.metrics":
        return this.getPageMetrics(params);
      case "capture.annotate":
        return this.annotatePage(params);
      case "capture.clearAnnotations":
        return this.clearAnnotations(params);
      case "capture.highlight":
        return this.highlight(params);
      case "execution.executeJs":
        return this.executeJs(params);
      case "wait.selector":
        return this.waitForSelector(params);
      case "wait.navigation":
        return this.waitForNavigation(params);
      case "wait.networkIdle":
        return this.waitForNetworkIdle(params);
      case "cookies.get":
        return this.getCookies(params);
      case "cookies.set":
        return this.setCookie(params);
      case "cookies.delete":
        return this.deleteCookie(params);
      case "storage.get":
        return this.getStorage(params);
      case "storage.set":
        return this.setStorage(params);
      case "storage.clear":
        return this.clearStorage(params);
      case "dialog.setBehavior":
        return this.setDialogBehavior(params);
      case "dialog.getLast":
        return this.getLastDialog(params);
      case "monitor.consoleLogs":
        return this.getConsoleLogs(params);
      case "monitor.pageErrors":
        return this.getPageErrors(params);
      default:
        throw new Error(`Unsupported action: ${action satisfies never}`);
    }
  }

  private resolveBrowserType(): BrowserType {
    switch (this.options.browserName) {
      case "chromium":
        return chromium;
      case "firefox":
        return firefox;
      case "webkit":
        return webkit;
      default:
        throw new Error(
          `Unsupported BROWSER_NAME=${this.options.browserName}. Use chromium, firefox, or webkit.`,
        );
    }
  }

  private resolveExecutablePath(): string | undefined {
    if (this.options.executablePath) {
      return this.options.executablePath;
    }

    const candidates =
      this.options.browserName === "firefox"
        ? ["/usr/bin/firefox"]
        : this.options.browserName === "webkit"
          ? []
          : [
              "/usr/bin/chromium",
              "/usr/bin/chromium-browser",
              "/usr/bin/google-chrome",
              "/usr/bin/google-chrome-stable",
            ];

    return candidates.find((candidate) => existsSync(candidate));
  }

  private attachPage(page: Page): void {
    if (this.pageStates.has(page)) {
      return;
    }

    const state: PageState = {
      consoleLogs: [],
      pageErrors: [],
      dialogBehavior: { action: "dismiss" },
      lastDialog: null,
    };
    this.pageStates.set(page, state);

    page.on("console", (message) => this.recordConsole(page, message));
    page.on("pageerror", (error) => {
      state.pageErrors.push({
        message: error.message,
        stack: error.stack ?? null,
        time: Date.now(),
      });
      trimEntries(state.pageErrors);
    });
    page.on("dialog", (dialog) => void this.handleDialog(page, dialog));
    page.on("close", () => this.pageStates.delete(page));
  }

  private recordConsole(page: Page, message: ConsoleMessage): void {
    const state = this.pageStates.get(page);
    if (!state) {
      return;
    }
    state.consoleLogs.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
      time: Date.now(),
    });
    trimEntries(state.consoleLogs);
  }

  private async handleDialog(page: Page, dialog: Dialog): Promise<void> {
    const state = this.getPageState(page);
    state.lastDialog = {
      type: dialog.type(),
      message: dialog.message(),
      defaultValue: dialog.defaultValue(),
      time: Date.now(),
    };
    const behavior = state.dialogBehavior;
    if (behavior.action === "accept") {
      await dialog.accept(behavior.text ?? "");
    } else {
      await dialog.dismiss();
    }
  }

  private async listTabs(): Promise<Array<Record<string, unknown>>> {
    return this.pages().map((page, index) => ({
      tabId: index + 1,
      title: page.url() === "about:blank" ? "about:blank" : page.url(),
      url: page.url(),
      active: index + 1 === this.resolveActiveTabId(),
    }));
  }

  private async openTab(url: string): Promise<Record<string, unknown>> {
    const page = await this.requireContext().newPage();
    this.attachPage(page);
    this.activeTabId = this.tabIdForPage(page);
    if (url && url !== "about:blank") {
      await this.goto(page, url);
    }
    return {
      tabId: this.tabIdForPage(page),
      url: page.url(),
      title: await page.title().catch(() => page.url()),
    };
  }

  private async closeTab(page: Page): Promise<null> {
    await page.close();
    this.activeTabId = this.pages()[0] ? 1 : null;
    return null;
  }

  private async activateTab(page: Page): Promise<null> {
    this.activeTabId = this.tabIdForPage(page);
    await page.bringToFront().catch(() => undefined);
    return null;
  }

  private async navigate(
    page: Page,
    url: string,
  ): Promise<Record<string, unknown>> {
    await this.goto(page, url);
    return {
      tabId: this.tabIdForPage(page),
      url: page.url(),
      title: await page.title().catch(() => page.url()),
    };
  }

  private async goBack(page: Page): Promise<null> {
    await page.goBack({ waitUntil: "domcontentloaded" });
    return null;
  }

  private async goForward(page: Page): Promise<null> {
    await page.goForward({ waitUntil: "domcontentloaded" });
    return null;
  }

  private async reload(page: Page): Promise<null> {
    await page.reload({ waitUntil: "domcontentloaded" });
    return null;
  }

  private async getHtml(params: Record<string, unknown>): Promise<string> {
    const page = this.getPage(params);
    const selector = typeof params.selector === "string" ? params.selector : null;
    const outer = params.outer !== false;
    const clean = params.clean !== false;
    if (!selector) {
      const html = await page.content();
      return clean ? cleanupHtml(html) : html;
    }
    const locator = page.locator(selector).first();
    const html = outer
      ? await locator.evaluate((el) => el.outerHTML)
      : await locator.evaluate((el) => el.innerHTML);
    return clean ? cleanupHtml(html) : html;
  }

  private async getText(params: Record<string, unknown>): Promise<string> {
    const page = this.getPage(params);
    const selector = typeof params.selector === "string" ? params.selector : null;
    const raw = params.raw === true;
    const mainContent = params.mainContent !== false;
    if (selector) {
      const locator = page.locator(selector).first();
      return raw
        ? await locator.evaluate((el) => el.textContent ?? "")
        : normalizeText(await locator.innerText());
    }
    if (raw) {
      return normalizeText(await page.evaluate(() => document.body.textContent ?? ""));
    }
    if (mainContent) {
      return normalizeText(
        await page.evaluate(() => {
          const main =
            document.querySelector("main, article, [role='main']") ??
            document.body;
          return (main as HTMLElement).innerText ?? main.textContent ?? "";
        }),
      );
    }
    return normalizeText(await page.locator("body").innerText());
  }

  private async querySelector(
    params: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>> {
    const page = this.getPage(params);
    const selector = String(params.selector ?? "");
    const limit = Number(params.limit ?? 20);
    const visibleOnly = params.visibleOnly === true;
    return await page.locator(selector).evaluateAll(
      (elements, options) =>
        elements
          .filter((el) => {
            if (!options.visibleOnly) return true;
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== "hidden" &&
              style.display !== "none"
            );
          })
          .slice(0, options.limit)
          .map((el, index) => {
            const rect = el.getBoundingClientRect();
            return {
              index,
              tag: el.tagName.toLowerCase(),
              id: el.id || null,
              classes: [...el.classList],
              text: ((el as HTMLElement).innerText || el.textContent || "")
                .trim()
                .slice(0, 200),
              attributes: Object.fromEntries(
                [...el.attributes].map((attr) => [attr.name, attr.value]),
              ),
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
            };
          }),
      { limit, visibleOnly },
    );
  }

  private async getFormValues(
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const page = this.getPage(params);
    const selector = String(params.selector ?? "");
    return await page.locator(selector).first().evaluate((form) => {
      if (!(form instanceof HTMLFormElement)) {
        throw new Error("Selector does not point to a form");
      }
      const data: Record<string, unknown> = {};
      for (const el of [...form.elements]) {
        if (
          !(el instanceof HTMLElement) ||
          !("name" in el) ||
          typeof el.name !== "string" ||
          !el.name
        ) {
          continue;
        }
        if (
          el instanceof HTMLInputElement &&
          (el.type === "checkbox" || el.type === "radio")
        ) {
          data[el.name] = el.checked;
        } else if ("value" in el) {
          data[el.name] = (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
            .value;
        }
      }
      return data;
    });
  }

  private async getAccessibilityTree(
    params: Record<string, unknown>,
  ): Promise<string> {
    const page = this.getPage(params);
    const maxElements = Number(params.maxElements ?? 500);
    const entries = await page.locator("a,button,input,select,textarea,[role],[tabindex]").evaluateAll(
      (elements, limit) =>
        elements.slice(0, limit).map((el, index) => ({
          ref: index + 1,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || null,
          name:
            (el.getAttribute("aria-label") ||
              (el as HTMLElement).innerText ||
              (el as HTMLInputElement).value ||
              el.getAttribute("name") ||
              "")
              .trim()
              .slice(0, 160),
          disabled:
            el instanceof HTMLButtonElement ||
            el instanceof HTMLInputElement ||
            el instanceof HTMLSelectElement ||
            el instanceof HTMLTextAreaElement
              ? el.disabled
              : el.getAttribute("aria-disabled") === "true",
        })),
      maxElements,
    );
    return entries
      .map(
        (entry) =>
          `@${entry.ref} <${entry.tag}> role=${entry.role ?? "none"} name="${entry.name}" disabled=${entry.disabled}`,
      )
      .join("\n");
  }

  private async click(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    await page.locator(String(params.selector ?? "")).first().click();
    return null;
  }

  private async typeText(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    const locator = page.locator(String(params.selector ?? "")).first();
    if (params.clear !== false) {
      await locator.clear();
    }
    await locator.fill(String(params.text ?? ""));
    return null;
  }

  private async typeSecret(params: Record<string, unknown>): Promise<null> {
    const secret = await this.secrets.get(String(params.secretId ?? ""));
    const page = this.getPage(params);
    const locator = page.locator(String(params.selector ?? "")).first();
    if (params.clear !== false) {
      await locator.clear();
    }
    await locator.fill(secret);
    return null;
  }

  private async scroll(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    if (typeof params.selector === "string") {
      await page.locator(params.selector).first().scrollIntoViewIfNeeded();
      return null;
    }
    const x = Number(params.x ?? 0);
    const y = Number(params.y ?? 0);
    await page.evaluate(
      ([dx, dy]) => window.scrollBy(dx, dy),
      [x, y] as const,
    );
    return null;
  }

  private async pressKey(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    if (typeof params.selector === "string") {
      await page.locator(params.selector).first().focus();
    }
    await page.keyboard.press(String(params.key ?? ""));
    return null;
  }

  private async selectOption(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    const locator = page.locator(String(params.selector ?? "")).first();
    const option =
      typeof params.value === "string"
        ? { value: params.value }
        : typeof params.label === "string"
          ? { label: params.label }
          : typeof params.index === "number"
            ? { index: params.index }
            : undefined;
    if (!option) {
      throw new Error("Provide value, label, or index");
    }
    await locator.selectOption(option);
    return null;
  }

  private async check(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    const locator = page.locator(String(params.selector ?? "")).first();
    if (params.checked === false) {
      await locator.uncheck();
    } else {
      await locator.check();
    }
    return null;
  }

  private async clickAnnotation(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    const ref = Number(params.ref);
    await page.locator(`[data-ai-browser-ref="${ref}"]`).first().click();
    return null;
  }

  private async typeAnnotation(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    const ref = Number(params.ref);
    const locator = page.locator(`[data-ai-browser-ref="${ref}"]`).first();
    if (params.clear !== false) {
      await locator.clear();
    }
    await locator.fill(String(params.text ?? ""));
    return null;
  }

  private async captureScreenshot(params: Record<string, unknown>): Promise<string> {
    const page = this.getPage(params);
    const buffer = await page.screenshot({ type: "png" });
    return `data:image/png;base64,${buffer.toString("base64")}`;
  }

  private async getComputedStyles(
    params: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    const page = this.getPage(params);
    const selector = String(params.selector ?? "");
    const properties = Array.isArray(params.properties)
      ? params.properties.map(String)
      : null;
    return await page.locator(selector).first().evaluate(
      (el, props) => {
        const style = getComputedStyle(el);
        const keys = props ?? Array.from(style);
        return Object.fromEntries(
          keys.map((key) => [key, style.getPropertyValue(key)]),
        );
      },
      properties,
    );
  }

  private async getElementRect(
    params: Record<string, unknown>,
  ): Promise<Record<string, number>> {
    const page = this.getPage(params);
    const box = await page.locator(String(params.selector ?? "")).first().boundingBox();
    if (!box) {
      throw new Error("Element is not visible");
    }
    return { ...box, devicePixelRatio: await page.evaluate(() => window.devicePixelRatio || 1) };
  }

  private async getPageMetrics(
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const page = this.getPage(params);
    return await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return {
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        domNodes: document.getElementsByTagName("*").length,
        resources: performance.getEntriesByType("resource").length,
        navigation: nav
          ? {
              type: nav.type,
              domContentLoaded: nav.domContentLoadedEventEnd,
              loadEventEnd: nav.loadEventEnd,
            }
          : null,
      };
    });
  }

  private async annotatePage(params: Record<string, unknown>): Promise<{ count: number }> {
    const page = this.getPage(params);
    return await page.evaluate(() => {
      const existing = document.getElementById("__ai_browser_overlay_root__");
      existing?.remove();

      const root = document.createElement("div");
      root.id = "__ai_browser_overlay_root__";
      root.style.position = "absolute";
      root.style.inset = "0";
      root.style.pointerEvents = "none";
      root.style.zIndex = "2147483647";
      document.documentElement.appendChild(root);

      const interactive = [
        ...document.querySelectorAll(
          "a,button,input,select,textarea,[role='button'],[role='link'],[tabindex]",
        ),
      ].filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      });

      interactive.forEach((el, index) => {
        const ref = String(index + 1);
        el.setAttribute("data-ai-browser-ref", ref);
        const rect = el.getBoundingClientRect();
        const badge = document.createElement("div");
        badge.textContent = ref;
        badge.style.position = "absolute";
        badge.style.left = `${window.scrollX + rect.left}px`;
        badge.style.top = `${window.scrollY + rect.top}px`;
        badge.style.background = "#d92d20";
        badge.style.color = "#fff";
        badge.style.font = "12px/1 monospace";
        badge.style.padding = "2px 4px";
        badge.style.borderRadius = "4px";
        badge.style.pointerEvents = "none";
        root.appendChild(badge);
      });

      return { count: interactive.length };
    });
  }

  private async clearAnnotations(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    await page.evaluate(() => {
      document
        .querySelectorAll("[data-ai-browser-ref]")
        .forEach((el) => el.removeAttribute("data-ai-browser-ref"));
      document.getElementById("__ai_browser_overlay_root__")?.remove();
    });
    return null;
  }

  private async highlight(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    const selector = String(params.selector ?? "");
    const color = String(params.color ?? "rgba(229, 62, 62, 0.3)");
    const duration = Number(params.duration ?? 3000);
    await page.locator(selector).first().evaluate(
      (el, data) => {
        const rect = el.getBoundingClientRect();
        const overlay = document.createElement("div");
        overlay.id = "__ai_browser_highlight__";
        overlay.style.position = "absolute";
        overlay.style.left = `${window.scrollX + rect.left}px`;
        overlay.style.top = `${window.scrollY + rect.top}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        overlay.style.background = data.color;
        overlay.style.outline = "2px solid #d92d20";
        overlay.style.pointerEvents = "none";
        overlay.style.zIndex = "2147483647";
        document.body.appendChild(overlay);
        window.setTimeout(() => overlay.remove(), data.duration);
      },
      { color, duration },
    );
    return null;
  }

  private async executeJs(params: Record<string, unknown>): Promise<unknown> {
    const page = this.getPage(params);
    const code = String(params.code ?? "");
    return await page.evaluate((source) => {
      return globalThis.eval(source);
    }, code);
  }

  private async waitForSelector(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    await page.locator(String(params.selector ?? "")).first().waitFor({
      state: params.visible === true ? "visible" : "attached",
      timeout: Number(params.timeout ?? 10000),
    });
    return null;
  }

  private async waitForNavigation(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    await page.waitForLoadState("load", {
      timeout: Number(params.timeout ?? 30000),
    });
    return null;
  }

  private async waitForNetworkIdle(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    await page.waitForLoadState("networkidle", {
      timeout: Number(params.timeout ?? 10000),
    });
    return null;
  }

  private async getCookies(
    params: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>> {
    const url =
      typeof params.url === "string" && params.url
        ? this.normalizeUrl(params.url)
        : this.getPage(params).url();
    return (await this.requireContext().cookies([url])).map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    }));
  }

  private async setCookie(params: Record<string, unknown>): Promise<null> {
    const url = this.normalizeUrl(String(params.url ?? ""));
    await this.requireContext().addCookies([
      {
        url,
        name: String(params.name ?? ""),
        value: String(params.value ?? ""),
        domain:
          typeof params.domain === "string"
            ? params.domain
            : new URL(url).hostname,
        path: typeof params.path === "string" ? params.path : "/",
        secure: params.secure === true,
        httpOnly: params.httpOnly === true,
        expires:
          typeof params.expirationDate === "number"
            ? params.expirationDate
            : undefined,
      },
    ]);
    return null;
  }

  private async deleteCookie(params: Record<string, unknown>): Promise<null> {
    const url = this.normalizeUrl(String(params.url ?? ""));
    const name = String(params.name ?? "");
    const context = this.requireContext();
    const cookies = await context.cookies([url]);
    await context.clearCookies();
    const remaining = cookies.filter((cookie) => cookie.name !== name);
    if (remaining.length > 0) {
      await context.addCookies(remaining);
    }
    return null;
  }

  private async getStorage(
    params: Record<string, unknown>,
  ): Promise<Record<string, string> | string | null> {
    const page = this.getPage(params);
    const type = params.type === "session" ? "sessionStorage" : "localStorage";
    if (typeof params.key === "string") {
      return await page.evaluate(
        ([storageType, key]) =>
          window[storageType as "localStorage" | "sessionStorage"].getItem(key),
        [type, params.key] as const,
      );
    }
    return await page.evaluate((storageType) => {
      const store = window[storageType as "localStorage" | "sessionStorage"];
      return Object.fromEntries(
        Object.keys(store).map((key) => [key, store.getItem(key) ?? ""]),
      );
    }, type);
  }

  private async setStorage(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    const type = params.type === "session" ? "sessionStorage" : "localStorage";
    await page.evaluate(
      ([storageType, key, value]) => {
        window[storageType as "localStorage" | "sessionStorage"].setItem(
          key,
          value,
        );
      },
      [type, String(params.key ?? ""), String(params.value ?? "")] as const,
    );
    return null;
  }

  private async clearStorage(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    const type = params.type === "session" ? "sessionStorage" : "localStorage";
    await page.evaluate((storageType) => {
      window[storageType as "localStorage" | "sessionStorage"].clear();
    }, type);
    return null;
  }

  private async setDialogBehavior(params: Record<string, unknown>): Promise<null> {
    const page = this.getPage(params);
    const state = this.getPageState(page);
    state.dialogBehavior = {
      action: params.action === "accept" ? "accept" : "dismiss",
      text: typeof params.text === "string" ? params.text : undefined,
    };
    return null;
  }

  private async getLastDialog(
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    return this.getPageState(this.getPage(params)).lastDialog;
  }

  private async getConsoleLogs(
    params: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>> {
    const entries = this.getPageState(this.getPage(params)).consoleLogs;
    const level = typeof params.level === "string" ? params.level : "all";
    const limit = Number(params.limit ?? 100);
    return entries
      .filter((entry) => level === "all" || entry.type === level)
      .slice(-limit);
  }

  private async getPageErrors(
    params: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>> {
    const limit = Number(params.limit ?? 50);
    return this.getPageState(this.getPage(params)).pageErrors.slice(-limit);
  }

  private getPage(params: Record<string, unknown>): Page {
    const page = this.pageFromTabId(
      typeof params.tabId === "number" ? params.tabId : this.resolveActiveTabId(),
    );
    this.activeTabId = this.tabIdForPage(page);
    return page;
  }

  private requirePage(params: Record<string, unknown>): Page {
    if (typeof params.tabId !== "number") {
      throw new Error("tabId is required");
    }
    return this.pageFromTabId(params.tabId);
  }

  private pageFromTabId(tabId: number): Page {
    const page = this.pages()[tabId - 1];
    if (!page) {
      throw new Error(`Tab not found: ${tabId}`);
    }
    return page;
  }

  private pages(): Page[] {
    return this.requireContext().pages();
  }

  private requireContext(): BrowserContext {
    if (!this.context) {
      throw new Error("Browser context is not initialized");
    }
    return this.context;
  }

  private resolveActiveTabId(): number {
    if (this.activeTabId !== null) {
      return this.activeTabId;
    }
    if (this.pages()[0]) {
      this.activeTabId = 1;
      return 1;
    }
    throw new Error("No active tab");
  }

  private tabIdForPage(page: Page): number {
    const index = this.pages().indexOf(page);
    if (index === -1) {
      throw new Error("Page is not part of the active context");
    }
    return index + 1;
  }

  private getPageState(page: Page): PageState {
    const state = this.pageStates.get(page);
    if (!state) {
      throw new Error("Page state is not initialized");
    }
    return state;
  }

  private async goto(page: Page, rawUrl: string): Promise<void> {
    const url = this.normalizeUrl(rawUrl);
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: this.options.startupTimeoutMs,
    });
  }

  private normalizeUrl(rawUrl: string): string {
    if (!rawUrl || rawUrl === "about:blank") {
      return "about:blank";
    }
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(rawUrl)) {
      return rawUrl;
    }
    return `https://${rawUrl}`;
  }
}

function trimEntries(entries: Array<Record<string, unknown>>): void {
  if (entries.length > MAX_LOG_ENTRIES) {
    entries.splice(0, entries.length - MAX_LOG_ENTRIES);
  }
}

function normalizeText(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function cleanupHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
    .replace(/\sdata-[\w-]+=(["']).*?\1/gi, "");
}
