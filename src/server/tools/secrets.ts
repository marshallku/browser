import { readFile } from "node:fs/promises";
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
    "secret_import_csv",
    "Import sensitive values from a CSV file into the secret store. The CSV must include a header row.",
    {
      path: z.string().describe("Path to the CSV file"),
      valueColumn: z
        .string()
        .optional()
        .describe("Column containing the secret value (default: password)"),
      labelColumn: z
        .string()
        .optional()
        .describe("Single column to use as the secret label"),
      labelColumns: z
        .array(z.string())
        .optional()
        .describe("Multiple columns to join into the label when labelColumn is not enough"),
      delimiter: z
        .string()
        .optional()
        .describe("CSV delimiter character (default: ,)"),
      skipEmpty: z
        .boolean()
        .optional()
        .describe("Skip rows where the value column is empty (default: true)"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of rows to import"),
    },
    async ({
      path,
      valueColumn,
      labelColumn,
      labelColumns,
      delimiter,
      skipEmpty,
      limit,
    }) => {
      const source = await readFile(path, "utf8");
      const rows = parseCsv(source, delimiter ?? ",");
      if (rows.length === 0) {
        return {
          content: [{ type: "text", text: "CSV file is empty" }],
          isError: true,
        };
      }

      const [header, ...body] = rows;
      const normalizedHeader = header.map((cell) => cell.trim());
      const valueKey =
        valueColumn ??
        normalizedHeader.find((cell) => cell.toLowerCase() === "password") ??
        normalizedHeader.find((cell) => cell.toLowerCase() === "value") ??
        normalizedHeader[0];

      if (!normalizedHeader.includes(valueKey)) {
        return {
          content: [
            {
              type: "text",
              text: `Value column not found: ${valueKey}`,
            },
          ],
          isError: true,
        };
      }

      const labelKeys =
        labelColumns && labelColumns.length > 0
          ? labelColumns
          : labelColumn
            ? [labelColumn]
            : normalizedHeader.filter((cell) =>
                ["label", "name", "title", "site", "url", "username", "email"].includes(
                  cell.toLowerCase(),
                ),
              );

      const maxRows = typeof limit === "number" ? limit : body.length;
      const imported: Array<Record<string, unknown>> = [];
      let skipped = 0;

      for (const [index, row] of body.entries()) {
        if (imported.length >= maxRows) {
          break;
        }

        const record = Object.fromEntries(
          normalizedHeader.map((key, i) => [key, row[i] ?? ""]),
        );
        const value = String(record[valueKey] ?? "");
        if (!value.trim()) {
          if (skipEmpty !== false) {
            skipped += 1;
            continue;
          }
        }

        const label = labelKeys
          .map((key) => String(record[key] ?? "").trim())
          .filter(Boolean)
          .join(" | ");
        const secret = await secrets.put(value, label || undefined);
        imported.push({
          row: index + 2,
          secretId: secret.id,
          label: secret.label ?? null,
          preview: redact(value, 2),
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                importedCount: imported.length,
                skippedCount: skipped,
                valueColumn: valueKey,
                labelColumns: labelKeys,
                entries: imported,
              },
              null,
              2,
            ),
          },
        ],
      };
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

function parseCsv(source: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      if (row.some((entry) => entry.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((entry) => entry.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}
