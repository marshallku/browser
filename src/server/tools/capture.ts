import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";
import { PNG } from "pngjs";

export function registerCaptureTools(server: McpServer): void {
  server.tool(
    "screenshot",
    "Capture a screenshot of the visible area of a tab",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ tabId }) => {
      const res = await send("capture.screenshot", { tabId });
      if (!res.success) {
        return { content: [{ type: "text", text: res.error! }], isError: true };
      }
      const dataUrl = String(res.data);
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      return {
        content: [{ type: "image", data: base64, mimeType: "image/png" }],
      };
    },
  );

  server.tool(
    "get_computed_styles",
    "Get computed CSS styles for an element",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      selector: z.string().describe("CSS selector of the element"),
      properties: z
        .array(z.string())
        .optional()
        .describe("Specific CSS properties to get (default: all)"),
    },
    async ({ tabId, selector, properties }) => {
      const res = await send("capture.computedStyles", {
        tabId,
        selector,
        properties,
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
    "annotate_page",
    "Overlay numbered badges on all interactive elements and return an annotated screenshot. Use click_annotation/type_annotation to interact by ref number.",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
    },
    async ({ tabId }) => {
      const annotateRes = await send("capture.annotate", { tabId });
      if (!annotateRes.success) {
        return {
          content: [{ type: "text", text: annotateRes.error! }],
          isError: true,
        };
      }

      const screenshotRes = await send("capture.screenshot", { tabId });

      await send("capture.clearAnnotations", { tabId });

      if (!screenshotRes.success) {
        return {
          content: [
            {
              type: "text",
              text: `Annotated ${(annotateRes.data as { count: number }).count} elements but screenshot failed: ${screenshotRes.error}`,
            },
          ],
          isError: true,
        };
      }

      const dataUrl = String(screenshotRes.data);
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      return {
        content: [
          {
            type: "text",
            text: `Annotated ${(annotateRes.data as { count: number }).count} interactive elements. Use click_annotation(ref) or type_annotation(ref, text) to interact.`,
          },
          { type: "image", data: base64, mimeType: "image/png" },
        ],
      };
    },
  );

  server.tool(
    "highlight_element",
    "Temporarily highlight an element on the page with a colored overlay for visual debugging",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      selector: z.string().describe("CSS selector of element to highlight"),
      color: z
        .string()
        .optional()
        .describe("Overlay color (default: rgba(229, 62, 62, 0.3))"),
      duration: z
        .number()
        .optional()
        .describe("Duration in ms before overlay fades (default: 3000)"),
    },
    async ({ tabId, selector, color, duration }) => {
      const res = await send("capture.highlight", {
        tabId,
        selector,
        color,
        duration,
      });
      return {
        content: [
          {
            type: "text",
            text: res.success ? "Element highlighted" : res.error!,
          },
        ],
        isError: !res.success,
      };
    },
  );

  server.tool(
    "screenshot_element",
    "Take a screenshot of a specific element by scrolling it into view and cropping the result",
    {
      tabId: z.number().optional().describe("Tab ID (default: active tab)"),
      selector: z.string().describe("CSS selector of element to screenshot"),
    },
    async ({ tabId, selector }) => {
      const rectRes = await send("capture.elementRect", {
        tabId,
        selector,
      });
      if (!rectRes.success) {
        return {
          content: [{ type: "text", text: rectRes.error! }],
          isError: true,
        };
      }

      const screenshotRes = await send("capture.screenshot", { tabId });
      if (!screenshotRes.success) {
        return {
          content: [{ type: "text", text: screenshotRes.error! }],
          isError: true,
        };
      }

      const rect = rectRes.data as {
        x: number;
        y: number;
        width: number;
        height: number;
        devicePixelRatio: number;
      };
      const dpr = rect.devicePixelRatio || 1;

      const dataUrl = String(screenshotRes.data);
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      const imgBuffer = Buffer.from(base64Data, "base64");

      try {
        const src = PNG.sync.read(imgBuffer);
        const cx = Math.round(rect.x * dpr);
        const cy = Math.round(rect.y * dpr);
        const cw = Math.min(Math.round(rect.width * dpr), src.width - cx);
        const ch = Math.min(Math.round(rect.height * dpr), src.height - cy);

        if (cw <= 0 || ch <= 0) {
          return {
            content: [
              { type: "image", data: base64Data, mimeType: "image/png" },
            ],
          };
        }

        const dst = new PNG({ width: cw, height: ch });
        PNG.bitblt(src, dst, cx, cy, cw, ch, 0, 0);
        const croppedBuffer = PNG.sync.write(dst);
        const croppedBase64 = croppedBuffer.toString("base64");

        return {
          content: [
            { type: "image", data: croppedBase64, mimeType: "image/png" },
          ],
        };
      } catch {
        return {
          content: [{ type: "image", data: base64Data, mimeType: "image/png" }],
        };
      }
    },
  );

  server.tool(
    "screenshot_diff",
    "Compare two screenshots and return the diff percentage and a visual diff image. Provide two base64 PNG images.",
    {
      image1: z.string().describe("First image as base64 PNG"),
      image2: z.string().describe("Second image as base64 PNG"),
      threshold: z
        .number()
        .optional()
        .describe(
          "Color distance threshold for pixel comparison (0-255, default: 30)",
        ),
    },
    async ({ image1, image2, threshold }) => {
      const thresh = threshold ?? 30;

      try {
        const img1 = PNG.sync.read(Buffer.from(image1, "base64"));
        const img2 = PNG.sync.read(Buffer.from(image2, "base64"));

        if (img1.width !== img2.width || img1.height !== img2.height) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  match: false,
                  diffPercent: 100,
                  reason: `Dimension mismatch: ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`,
                }),
              },
            ],
          };
        }

        const diff = new PNG({ width: img1.width, height: img1.height });
        let mismatchCount = 0;
        const totalPixels = img1.width * img1.height;

        for (let i = 0; i < img1.data.length; i += 4) {
          const dr = img1.data[i] - img2.data[i];
          const dg = img1.data[i + 1] - img2.data[i + 1];
          const db = img1.data[i + 2] - img2.data[i + 2];
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);

          if (dist > thresh) {
            mismatchCount++;
            diff.data[i] = 255;
            diff.data[i + 1] = 0;
            diff.data[i + 2] = 0;
            diff.data[i + 3] = 255;
          } else {
            const gray = Math.round(
              0.299 * img1.data[i] +
                0.587 * img1.data[i + 1] +
                0.114 * img1.data[i + 2],
            );
            diff.data[i] = gray;
            diff.data[i + 1] = gray;
            diff.data[i + 2] = gray;
            diff.data[i + 3] = 255;
          }
        }

        const diffPercent = parseFloat(
          ((mismatchCount / totalPixels) * 100).toFixed(2),
        );
        const diffBase64 = PNG.sync.write(diff).toString("base64");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                match: diffPercent === 0,
                diffPercent,
                totalPixels,
                mismatchedPixels: mismatchCount,
              }),
            },
            { type: "image", data: diffBase64, mimeType: "image/png" },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to compare images: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
