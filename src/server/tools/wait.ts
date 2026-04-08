import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";

export function registerWaitTools(server: McpServer): void {
  server.tool(
    "wait_for_selector",
    "Wait for an element matching a CSS selector to appear in the DOM",
    {
      selector: z.string().describe("CSS selector to wait for"),
      timeout: z
        .number()
        .optional()
        .describe("Timeout in milliseconds (default: 10000)"),
      visible: z
        .boolean()
        .optional()
        .describe("Wait for the element to be visible (default: false)"),
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ selector, timeout, visible, tabId }) => {
      const res = await send("wait.selector", {
        selector,
        timeout,
        visible,
        tabId,
      });
      return {
        content: [
          {
            type: "text",
            text: res.success ? `Element found: ${selector}` : res.error!,
          },
        ],
        isError: !res.success,
      };
    },
  );

  server.tool(
    "wait_for_navigation",
    "Wait for the current tab to finish loading (useful after navigate, click, or form submission)",
    {
      timeout: z
        .number()
        .optional()
        .describe("Timeout in milliseconds (default: 30000)"),
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ timeout, tabId }) => {
      const res = await send("wait.navigation", { timeout, tabId });
      return {
        content: [
          {
            type: "text",
            text: res.success ? "Navigation complete" : res.error!,
          },
        ],
        isError: !res.success,
      };
    },
  );

  server.tool(
    "wait_for_network_idle",
    "Wait for network activity to settle (no new requests for a period). Useful for SPAs that load data dynamically.",
    {
      timeout: z
        .number()
        .optional()
        .describe("Timeout in milliseconds (default: 10000)"),
      idleTime: z
        .number()
        .optional()
        .describe(
          "How long network must be quiet to be considered idle, in ms (default: 500)",
        ),
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ timeout, idleTime, tabId }) => {
      const res = await send("wait.networkIdle", {
        timeout,
        idleTime,
        tabId,
      });
      return {
        content: [
          {
            type: "text",
            text: res.success ? "Network is idle" : res.error!,
          },
        ],
        isError: !res.success,
      };
    },
  );
}
