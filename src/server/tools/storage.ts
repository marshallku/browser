import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";
import {
  createBridgeJsonResult,
  createBridgeTextResult,
  createTextResult,
} from "./toolResult.js";

export function registerStorageTools(server: McpServer): void {
  server.tool(
    "get_storage",
    "Get localStorage or sessionStorage data from the page",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      type: z
        .enum(["local", "session"])
        .describe("Storage type: local or session"),
      key: z
        .string()
        .optional()
        .describe("Specific key to get (default: all keys)"),
    },
    async ({ tabId, type, key }) => {
      const res = await send("storage.get", { tabId, type, key });
      return createBridgeJsonResult(res.success, res.data, res.error);
    }
  );

  server.tool(
    "set_storage",
    "Set a value in localStorage or sessionStorage",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      type: z
        .enum(["local", "session"])
        .describe("Storage type: local or session"),
      key: z.string().describe("Storage key"),
      value: z.string().describe("Storage value"),
    },
    async ({ tabId, type, key, value }) => {
      const res = await send("storage.set", { tabId, type, key, value });
      return createBridgeTextResult(
        res.success,
        "Storage value set",
        res.error
      );
    }
  );

  server.tool(
    "clear_storage",
    "Clear all data from localStorage or sessionStorage",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      type: z
        .enum(["local", "session"])
        .describe("Storage type to clear: local or session"),
    },
    async ({ tabId, type }) => {
      const res = await send("storage.clear", { tabId, type });
      return createBridgeTextResult(res.success, "Storage cleared", res.error);
    }
  );

  server.tool(
    "save_session",
    "Save the current session state (cookies + storage) for a URL",
    {
      url: z.string().describe("URL to save session for"),
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ url, tabId }) => {
      const [cookieRes, localRes, sessionRes] = await Promise.all([
        send("cookies.get", { url }),
        send("storage.get", { tabId, type: "local" }),
        send("storage.get", { tabId, type: "session" }),
      ]);

      if (!cookieRes.success) {
        return createTextResult({
          text: `Failed to get cookies: ${cookieRes.error}`,
          isError: true,
        });
      }

      const sessionData = {
        url,
        timestamp: Date.now(),
        cookies: cookieRes.data,
        localStorage: localRes.success ? localRes.data : {},
        sessionStorage: sessionRes.success ? sessionRes.data : {},
      };

      return createBridgeJsonResult(true, sessionData, undefined);
    }
  );

  server.tool(
    "restore_session",
    "Restore a previously saved session state (cookies + storage)",
    {
      sessionData: z.string().describe("JSON session data from save_session"),
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ sessionData, tabId }) => {
      let session: {
        url: string;
        cookies: Array<{
          name: string;
          value: string;
          domain?: string;
          path?: string;
          secure?: boolean;
          httpOnly?: boolean;
          expirationDate?: number;
        }>;
        localStorage: Record<string, string>;
        sessionStorage: Record<string, string>;
      };
      try {
        session = JSON.parse(sessionData);
      } catch {
        return createTextResult({
          text: "Invalid session data JSON",
          isError: true,
        });
      }

      const results: string[] = [];

      if (session.cookies) {
        for (const cookie of session.cookies) {
          await send("cookies.set", {
            url: session.url,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            expirationDate: cookie.expirationDate,
          });
        }
        results.push(`Restored ${session.cookies.length} cookies`);
      }

      if (session.localStorage) {
        for (const [key, value] of Object.entries(session.localStorage)) {
          await send("storage.set", {
            tabId,
            type: "local",
            key,
            value,
          });
        }
        results.push(
          `Restored ${
            Object.keys(session.localStorage).length
          } localStorage entries`
        );
      }

      if (session.sessionStorage) {
        for (const [key, value] of Object.entries(session.sessionStorage)) {
          await send("storage.set", {
            tabId,
            type: "session",
            key,
            value,
          });
        }
        results.push(
          `Restored ${
            Object.keys(session.sessionStorage).length
          } sessionStorage entries`
        );
      }

      return createTextResult({ text: results.join("\n") });
    }
  );
}
