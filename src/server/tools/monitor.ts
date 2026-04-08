import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";

export function registerMonitorTools(server: McpServer): void {
  server.tool(
    "get_console_logs",
    "Get captured console log messages from the page (log, warn, error)",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      level: z
        .enum(["all", "log", "warn", "error"])
        .optional()
        .describe("Filter by log level (default: all)"),
      limit: z
        .number()
        .optional()
        .describe("Maximum entries to return (default: 100)"),
    },
    async ({ tabId, level, limit }) => {
      const res = await send("monitor.consoleLogs", {
        tabId,
        level,
        limit,
      });
      return {
        content: [
          {
            type: "text",
            text: res.success ? JSON.stringify(res.data, null, 2) : res.error!,
          },
        ],
        isError: !res.success,
      };
    },
  );

  server.tool(
    "get_page_errors",
    "Get captured JavaScript errors and unhandled promise rejections from the page",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      limit: z
        .number()
        .optional()
        .describe("Maximum entries to return (default: 50)"),
    },
    async ({ tabId, limit }) => {
      const res = await send("monitor.pageErrors", { tabId, limit });
      return {
        content: [
          {
            type: "text",
            text: res.success ? JSON.stringify(res.data, null, 2) : res.error!,
          },
        ],
        isError: !res.success,
      };
    },
  );

  server.tool(
    "get_page_metrics",
    "Get page performance metrics including navigation timing, resource counts, and DOM size",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ tabId }) => {
      const res = await send("capture.metrics", { tabId });
      return {
        content: [
          {
            type: "text",
            text: res.success ? JSON.stringify(res.data, null, 2) : res.error!,
          },
        ],
        isError: !res.success,
      };
    },
  );
}
