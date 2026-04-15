import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";
import { createBridgeJsonResult } from "./toolResult.js";

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
      return createBridgeJsonResult(res.success, res.data, res.error);
    }
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
      return createBridgeJsonResult(res.success, res.data, res.error);
    }
  );

  server.tool(
    "get_network_logs",
    [
      "List HTTP requests made by the page (XHR, fetch, navigations, subresources).",
      "Captured automatically per tab from the moment the tab is attached; supports method/status/URL filtering.",
      "Returned entries include: url, method, resourceType, status, statusText, request/response headers, timing (startTime, endTime, durationMs), fromCache, failed, failureText, responseBodySize.",
      "Bodies (requestBody/responseBody) are omitted by default to save tokens. Pass includeBody=true to include them — only textual content types are captured, truncated at 100KB.",
      "Sensitive headers (Authorization, Cookie, Set-Cookie, Proxy-Authorization) are redacted.",
      "Memory cap: 500 entries per tab (oldest dropped); a tab close clears all entries.",
      "Use this to debug API calls: find failed requests (failed=true), check status codes for a URL pattern, inspect response headers or JSON bodies.",
    ].join(" "),
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      method: z
        .string()
        .optional()
        .describe("Filter by HTTP method (GET, POST, ...). Case-insensitive."),
      status: z
        .union([z.number(), z.string()])
        .optional()
        .describe(
          "Filter by status. Number (e.g. 404) for exact match, or '2xx'/'4xx'/'5xx' for a bucket."
        ),
      urlPattern: z
        .string()
        .optional()
        .describe(
          "Regex pattern matched against the request URL (e.g. '/api/users')."
        ),
      limit: z
        .number()
        .optional()
        .describe("Maximum entries to return (default: 100, cap: 500)"),
      includeBody: z
        .boolean()
        .optional()
        .describe(
          "Include requestBody and responseBody fields (default: false). Bodies are truncated at 100KB per entry."
        ),
    },
    async ({ tabId, method, status, urlPattern, limit, includeBody }) => {
      const res = await send("monitor.networkLogs", {
        tabId,
        method,
        status,
        urlPattern,
        limit,
        includeBody,
      });
      return createBridgeJsonResult(res.success, res.data, res.error);
    }
  );

  server.tool(
    "get_page_metrics",
    "Get page performance metrics including navigation timing, resource counts, and DOM size",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ tabId }) => {
      const res = await send("capture.metrics", { tabId });
      return createBridgeJsonResult(res.success, res.data, res.error);
    }
  );
}
