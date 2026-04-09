import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";
import {
  createBridgeJsonResult,
  createBridgeTextResult,
} from "./toolResult.js";

export function registerTabTools(server: McpServer): void {
  server.tool("list_tabs", "List all open browser tabs", {}, async () => {
    const res = await send("tabs.list");
    return createBridgeJsonResult(res.success, res.data, res.error);
  });

  server.tool(
    "open_tab",
    "Open a new browser tab",
    { url: z.string().describe("URL to open") },
    async ({ url }) => {
      const res = await send("tabs.open", { url });
      return createBridgeJsonResult(res.success, res.data, res.error);
    }
  );

  server.tool(
    "close_tab",
    "Close a browser tab",
    { tabId: z.number().describe("Tab ID to close") },
    async ({ tabId }) => {
      const res = await send("tabs.close", { tabId });
      return createBridgeTextResult(res.success, "Tab closed", res.error);
    }
  );

  server.tool(
    "navigate",
    "Navigate a tab to a URL",
    {
      url: z.string().describe("URL to navigate to"),
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ url, tabId }) => {
      const res = await send("tabs.navigate", { url, tabId });
      return createBridgeJsonResult(res.success, res.data, res.error);
    }
  );

  server.tool(
    "activate_tab",
    "Activate (focus) a browser tab",
    { tabId: z.number().describe("Tab ID to activate") },
    async ({ tabId }) => {
      const res = await send("tabs.activate", { tabId });
      return createBridgeTextResult(res.success, "Tab activated", res.error);
    }
  );

  server.tool(
    "go_back",
    "Navigate the tab back in history",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ tabId }) => {
      const res = await send("tabs.goBack", { tabId });
      return createBridgeTextResult(res.success, "Navigated back", res.error);
    }
  );

  server.tool(
    "go_forward",
    "Navigate the tab forward in history",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ tabId }) => {
      const res = await send("tabs.goForward", { tabId });
      return createBridgeTextResult(
        res.success,
        "Navigated forward",
        res.error
      );
    }
  );

  server.tool(
    "reload",
    "Reload the current tab",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ tabId }) => {
      const res = await send("tabs.reload", { tabId });
      return createBridgeTextResult(res.success, "Tab reloaded", res.error);
    }
  );
}
