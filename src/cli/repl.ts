import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { homedir } from "node:os";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { withDaemon, ensureDaemon } from "./daemonClient.js";
import type { BridgeAction } from "../shared/protocol.js";

const HISTORY_PATH = `${
  process.env.XDG_DATA_HOME ?? `${homedir()}/.local/share`
}/ai-browser/repl_history`;

const ACTIONS: ReadonlyArray<BridgeAction> = [
  "tabs.list",
  "tabs.open",
  "tabs.close",
  "tabs.navigate",
  "tabs.activate",
  "tabs.goBack",
  "tabs.goForward",
  "tabs.reload",
  "dom.getHtml",
  "dom.getText",
  "dom.contentSummary",
  "dom.querySelector",
  "dom.formValues",
  "dom.accessibilityTree",
  "interaction.click",
  "interaction.type",
  "interaction.typeSecret",
  "interaction.scroll",
  "interaction.pressKey",
  "interaction.hover",
  "interaction.mouseMove",
  "interaction.selectOption",
  "interaction.check",
  "interaction.clickAnnotation",
  "interaction.typeAnnotation",
  "capture.screenshot",
  "capture.computedStyles",
  "capture.elementRect",
  "capture.metrics",
  "capture.annotate",
  "capture.clearAnnotations",
  "capture.highlight",
  "execution.executeJs",
  "wait.selector",
  "wait.navigation",
  "wait.networkIdle",
  "cookies.get",
  "cookies.set",
  "cookies.delete",
  "storage.get",
  "storage.set",
  "storage.clear",
  "dialog.setBehavior",
  "dialog.getLast",
  "monitor.consoleLogs",
  "monitor.pageErrors",
  "monitor.networkLogs",
];

function loadHistory(): string[] {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    return readFileSync(HISTORY_PATH, "utf8")
      .split("\n")
      .filter((line) => line.length > 0)
      .slice(-1000);
  } catch {
    return [];
  }
}

function appendHistory(line: string): void {
  try {
    mkdirSync(dirname(HISTORY_PATH), { recursive: true });
    appendFileSync(HISTORY_PATH, line + "\n", { mode: 0o600 });
  } catch {
    // best-effort
  }
}

export async function runRepl(): Promise<void> {
  await ensureDaemon();
  const rl = createInterface({
    input: stdin,
    output: stdout,
    history: loadHistory(),
    historySize: 1000,
    completer: (line: string): [string[], string] => {
      const hits = ACTIONS.filter((a) => a.startsWith(line));
      return [hits.length > 0 ? [...hits] : [...ACTIONS], line];
    },
    terminal: stdout.isTTY,
  });

  console.log("ai-browser repl — type 'help' for commands, 'exit' to quit");
  console.log("syntax: <action> [json-params]   e.g.  tabs.navigate {\"url\":\"https://example.com\"}");

  await withDaemon(async (client) => {
    while (true) {
      let line: string;
      try {
        line = (await rl.question("> ")).trim();
      } catch {
        break;
      }
      if (line.length === 0) continue;
      if (line === "exit" || line === "quit" || line === ".exit") break;
      if (line === "help" || line === "?") {
        console.log("Available actions:");
        for (const a of ACTIONS) console.log(`  ${a}`);
        continue;
      }
      appendHistory(line);

      const space = line.indexOf(" ");
      const action = (space === -1 ? line : line.slice(0, space)) as BridgeAction;
      const paramText = space === -1 ? "" : line.slice(space + 1).trim();
      let params: Record<string, unknown> = {};
      if (paramText.length > 0) {
        try {
          params = JSON.parse(paramText);
        } catch (err) {
          console.error(
            `bad JSON params: ${err instanceof Error ? err.message : err}`
          );
          continue;
        }
      }

      try {
        const res = await client.send(action, params);
        if (res.success) {
          console.log(JSON.stringify(res.data ?? null, null, 2));
        } else {
          console.error(`error: ${res.error ?? "unknown"}`);
        }
      } catch (err) {
        console.error(
          `transport error: ${err instanceof Error ? err.message : err}`
        );
      }
    }
  });

  rl.close();
}
