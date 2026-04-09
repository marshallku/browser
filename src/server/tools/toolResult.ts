import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

interface TextResultOptions {
  text: string;
  isError?: boolean;
}

interface JsonResultOptions {
  data: unknown;
  isError?: boolean;
}

interface ImageResultOptions {
  dataUrl: string;
}

export const createTextResult = ({
  text,
  isError = false,
}: TextResultOptions): CallToolResult => ({
  content: [{ type: "text", text }],
  isError,
});

export const createJsonResult = ({
  data,
  isError = false,
}: JsonResultOptions): CallToolResult =>
  createTextResult({
    text: JSON.stringify(data, null, 2),
    isError,
  });

export const createBridgeTextResult = (
  success: boolean,
  data: unknown,
  error: string | undefined
): CallToolResult =>
  createTextResult({
    text: success ? String(data ?? "") : error ?? "Unknown error",
    isError: !success,
  });

export const createBridgeJsonResult = (
  success: boolean,
  data: unknown,
  error: string | undefined
): CallToolResult =>
  createJsonResult({
    data: success ? data : error ?? "Unknown error",
    isError: !success,
  });

export const createImageResult = ({
  dataUrl,
}: ImageResultOptions): CallToolResult => ({
  content: [
    {
      type: "image",
      data: dataUrl.replace(/^data:image\/png;base64,/, ""),
      mimeType: "image/png",
    },
  ],
});
