import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";

export function registerDomTools(server: McpServer): void {
  server.tool(
    "get_html",
    "Get HTML content from a page or element. By default removes script/style/svg tags, comments, and data-* attributes for cleaner output.",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      selector: z
        .string()
        .optional()
        .describe("CSS selector (default: document.body)"),
      outer: z
        .boolean()
        .optional()
        .describe("Include outer HTML (default: true)"),
      clean: z
        .boolean()
        .optional()
        .describe(
          "Remove script/style/svg tags, comments, data-* attrs (default: true)",
        ),
    },
    async ({ tabId, selector, outer, clean }) => {
      const res = await send("dom.getHtml", { tabId, selector, outer, clean });
      return {
        content: [
          { type: "text", text: res.success ? String(res.data) : res.error! },
        ],
        isError: !res.success,
      };
    },
  );

  server.tool(
    "get_text",
    "Get text content from a page or element. By default extracts only visible text from the main content area, skipping script/style/nav noise.",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      selector: z
        .string()
        .optional()
        .describe("CSS selector (default: auto-detect main content)"),
      raw: z
        .boolean()
        .optional()
        .describe("Return raw textContent without cleaning (default: false)"),
      mainContent: z
        .boolean()
        .optional()
        .describe(
          "Auto-detect main content area when no selector given (default: true)",
        ),
    },
    async ({ tabId, selector, raw, mainContent }) => {
      const res = await send("dom.getText", {
        tabId,
        selector,
        raw,
        mainContent,
      });
      return {
        content: [
          { type: "text", text: res.success ? String(res.data) : res.error! },
        ],
        isError: !res.success,
      };
    },
  );

  server.tool(
    "get_content_summary",
    "Get a cleaned, AI-friendly summary of the current page or element. Excludes common noise like nav/footer/script/style and returns text plus lightweight structure.",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      selector: z
        .string()
        .optional()
        .describe("Optional CSS selector to summarize instead of the auto-detected main content"),
      maxHeadings: z
        .number()
        .optional()
        .describe("Maximum headings to include (default: 20)"),
      maxLinks: z
        .number()
        .optional()
        .describe("Maximum links to include (default: 20)"),
      maxTextLength: z
        .number()
        .optional()
        .describe("Maximum cleaned text length (default: 4000)"),
    },
    async ({ tabId, selector, maxHeadings, maxLinks, maxTextLength }) => {
      const res = await send("dom.contentSummary", {
        tabId,
        selector,
        maxHeadings,
        maxLinks,
        maxTextLength,
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
    "query_selector",
    "Find elements matching a CSS selector",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      selector: z.string().describe("CSS selector"),
      limit: z.number().optional().describe("Max results (default: 20)"),
      visibleOnly: z
        .boolean()
        .optional()
        .describe("Exclude hidden/invisible elements (default: false)"),
    },
    async ({ tabId, selector, limit, visibleOnly }) => {
      const res = await send("dom.querySelector", {
        tabId,
        selector,
        limit,
        visibleOnly,
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
    "get_accessibility_tree",
    "Get a semantic accessibility tree of the page showing interactive elements with ref numbers, roles, names, and states. Ideal for understanding page structure.",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      maxElements: z
        .number()
        .optional()
        .describe("Maximum elements to include (default: 500)"),
    },
    async ({ tabId, maxElements }) => {
      const res = await send("dom.accessibilityTree", {
        tabId,
        maxElements,
      });
      return {
        content: [
          {
            type: "text",
            text: res.success ? String(res.data) : res.error!,
          },
        ],
        isError: !res.success,
      };
    },
  );

  server.tool(
    "get_form_values",
    "Get all named input values from a form element",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      selector: z.string().describe("CSS selector of the form element"),
    },
    async ({ tabId, selector }) => {
      const res = await send("dom.formValues", { tabId, selector });
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
