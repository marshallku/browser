import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";
import { getSecretStore, redact } from "../secrets.js";

export function registerSecretTools(server: McpServer): void {
  const secrets = getSecretStore();

  server.tool(
    "secret_store_put",
    "Store a sensitive value and return a secret handle that can be used later without exposing the plaintext again.",
    {
      value: z.string().describe("Sensitive plaintext to store"),
      label: z.string().optional().describe("Optional label for auditing"),
    },
    async ({ value, label }) => {
      const record = await secrets.put(value, label);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              secretId: record.id,
              label: record.label ?? null,
              createdAt: record.createdAt,
              preview: redact(value, 2),
            }),
          },
        ],
      };
    },
  );

  server.tool(
    "secret_store_delete",
    "Delete a previously stored secret handle.",
    {
      secretId: z.string().describe("Secret handle to delete"),
    },
    async ({ secretId }) => {
      await secrets.delete(secretId);
      return { content: [{ type: "text", text: "Secret deleted" }] };
    },
  );

  server.tool(
    "type_secret",
    "Type a previously stored secret into an input element without sending the plaintext back through the tool interface.",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      selector: z.string().describe("CSS selector of input element"),
      secretId: z.string().describe("Secret handle returned by secret_store_put"),
      clear: z
        .boolean()
        .optional()
        .describe("Clear existing value first (default: true)"),
    },
    async ({ tabId, selector, secretId, clear }) => {
      const res = await send("interaction.typeSecret", {
        tabId,
        selector,
        secretId,
        clear,
      });
      return {
        content: [
          { type: "text", text: res.success ? "Secret typed" : res.error! },
        ],
        isError: !res.success,
      };
    },
  );
}
