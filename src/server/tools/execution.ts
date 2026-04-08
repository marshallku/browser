import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";

export function registerExecutionTools(server: McpServer): void {
  server.tool(
    "execute_js",
    "Execute JavaScript code in a tab",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      code: z.string().describe("JavaScript code to execute"),
    },
    async ({ tabId, code }) => {
      const res = await send("execution.executeJs", { tabId, code });
      if (!res.success) {
        return { content: [{ type: "text", text: res.error! }], isError: true };
      }
      const text =
        typeof res.data === "string"
          ? res.data
          : JSON.stringify(res.data, null, 2);
      return { content: [{ type: "text", text }] };
    },
  );
}
