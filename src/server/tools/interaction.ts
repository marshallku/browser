import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";
import { createBridgeTextResult } from "./toolResult.js";

export function registerInteractionTools(server: McpServer): void {
  server.tool(
    "click_element",
    "Click an element on the page",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      selector: z.string().describe("CSS selector of element to click"),
    },
    async ({ tabId, selector }) => {
      const res = await send("interaction.click", { tabId, selector });
      return createBridgeTextResult(res.success, "Clicked", res.error);
    }
  );

  server.tool(
    "type_text",
    "Type text into an input element",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      selector: z.string().describe("CSS selector of input element"),
      text: z.string().describe("Text to type"),
      clear: z
        .boolean()
        .optional()
        .describe("Clear existing value first (default: true)"),
    },
    async ({ tabId, selector, text, clear }) => {
      const res = await send("interaction.type", {
        tabId,
        selector,
        text,
        clear,
      });
      return createBridgeTextResult(res.success, "Typed", res.error);
    }
  );

  server.tool(
    "scroll",
    "Scroll the page or an element",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      x: z.number().optional().describe("Horizontal scroll amount in pixels"),
      y: z.number().optional().describe("Vertical scroll amount in pixels"),
      selector: z
        .string()
        .optional()
        .describe("CSS selector to scroll into view"),
    },
    async ({ tabId, x, y, selector }) => {
      const res = await send("interaction.scroll", { tabId, x, y, selector });
      return createBridgeTextResult(res.success, "Scrolled", res.error);
    }
  );

  server.tool(
    "press_key",
    "Press a keyboard key",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      key: z
        .string()
        .describe("Key to press (e.g. 'Enter', 'Tab', 'Escape', 'a')"),
      selector: z
        .string()
        .optional()
        .describe("CSS selector of target element"),
    },
    async ({ tabId, key, selector }) => {
      const res = await send("interaction.pressKey", { tabId, key, selector });
      return createBridgeTextResult(res.success, "Key pressed", res.error);
    }
  );

  server.tool(
    "click_annotation",
    "Click an element by its annotation ref number (from annotate_page or get_accessibility_tree)",
    {
      ref: z.number().describe("Annotation reference number (e.g. 1, 2, 3)"),
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ ref, tabId }) => {
      const res = await send("interaction.clickAnnotation", { ref, tabId });
      return createBridgeTextResult(res.success, `Clicked @${ref}`, res.error);
    }
  );

  server.tool(
    "type_annotation",
    "Type text into an element by its annotation ref number (from annotate_page or get_accessibility_tree)",
    {
      ref: z.number().describe("Annotation reference number"),
      text: z.string().describe("Text to type"),
      clear: z
        .boolean()
        .optional()
        .describe("Clear existing value first (default: true)"),
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ ref, text, clear, tabId }) => {
      const res = await send("interaction.typeAnnotation", {
        ref,
        text,
        clear,
        tabId,
      });
      return createBridgeTextResult(
        res.success,
        `Typed into @${ref}`,
        res.error
      );
    }
  );

  server.tool(
    "select_option",
    "Select an option in a <select> dropdown element",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      selector: z.string().describe("CSS selector of the <select> element"),
      value: z.string().optional().describe("Option value to select"),
      label: z.string().optional().describe("Option label text to select"),
      index: z.number().optional().describe("Option index to select (0-based)"),
    },
    async ({ tabId, selector, value, label, index }) => {
      const res = await send("interaction.selectOption", {
        tabId,
        selector,
        value,
        label,
        index,
      });
      return createBridgeTextResult(res.success, "Option selected", res.error);
    }
  );

  server.tool(
    "check_element",
    "Check or uncheck a checkbox or radio button",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      selector: z.string().describe("CSS selector of checkbox/radio element"),
      checked: z
        .boolean()
        .optional()
        .describe("Desired checked state (default: true)"),
    },
    async ({ tabId, selector, checked }) => {
      const res = await send("interaction.check", {
        tabId,
        selector,
        checked,
      });
      return createBridgeTextResult(
        res.success,
        `Element ${checked === false ? "unchecked" : "checked"}`,
        res.error
      );
    }
  );
}
