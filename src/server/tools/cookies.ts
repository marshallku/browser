import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";
import {
  createBridgeJsonResult,
  createBridgeTextResult,
} from "./toolResult.js";

export function registerCookieTools(server: McpServer): void {
  server.tool(
    "get_cookies",
    "Get all cookies for a URL",
    {
      url: z.string().describe("URL to get cookies for"),
    },
    async ({ url }) => {
      const res = await send("cookies.get", { url });
      return createBridgeJsonResult(res.success, res.data, res.error);
    }
  );

  server.tool(
    "set_cookie",
    "Set a cookie",
    {
      url: z.string().describe("URL the cookie belongs to"),
      name: z.string().describe("Cookie name"),
      value: z.string().describe("Cookie value"),
      domain: z.string().optional().describe("Cookie domain"),
      path: z.string().optional().describe("Cookie path (default: /)"),
      secure: z.boolean().optional().describe("Secure flag"),
      httpOnly: z.boolean().optional().describe("HttpOnly flag"),
      expirationDate: z
        .number()
        .optional()
        .describe("Expiration as Unix timestamp"),
    },
    async ({
      url,
      name,
      value,
      domain,
      path,
      secure,
      httpOnly,
      expirationDate,
    }) => {
      const res = await send("cookies.set", {
        url,
        name,
        value,
        domain,
        path,
        secure,
        httpOnly,
        expirationDate,
      });
      return createBridgeTextResult(res.success, "Cookie set", res.error);
    }
  );

  server.tool(
    "delete_cookie",
    "Delete a cookie",
    {
      url: z.string().describe("URL the cookie belongs to"),
      name: z.string().describe("Cookie name to delete"),
    },
    async ({ url, name }) => {
      const res = await send("cookies.delete", { url, name });
      return createBridgeTextResult(res.success, "Cookie deleted", res.error);
    }
  );
}
