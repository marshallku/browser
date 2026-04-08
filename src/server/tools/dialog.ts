import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";

export function registerDialogTools(server: McpServer): void {
  server.tool(
    "set_dialog_behavior",
    "Configure how browser dialogs (alert, confirm, prompt) are handled. Set before triggering actions that may show dialogs.",
    {
      action: z
        .enum(["accept", "dismiss"])
        .describe("Whether to accept or dismiss the dialog"),
      text: z.string().optional().describe("Text to enter for prompt dialogs"),
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ action, text, tabId }) => {
      const res = await send("dialog.setBehavior", {
        action,
        text,
        tabId,
      });
      return {
        content: [
          {
            type: "text",
            text: res.success
              ? `Dialog behavior set to: ${action}`
              : res.error!,
          },
        ],
        isError: !res.success,
      };
    },
  );

  server.tool(
    "get_last_dialog",
    "Get information about the last browser dialog (alert, confirm, prompt) that was handled",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ tabId }) => {
      const res = await send("dialog.getLast", { tabId });
      return {
        content: [
          {
            type: "text",
            text: res.success
              ? res.data
                ? JSON.stringify(res.data, null, 2)
                : "No dialog has been captured yet"
              : res.error!,
          },
        ],
        isError: !res.success,
      };
    },
  );
}
