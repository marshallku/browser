import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcpServer.js";
import { initBridge, shutdownBridge } from "./bridge.js";

async function main(): Promise<void> {
  await initBridge();

  const mcpServer = createMcpServer();
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  console.error("[mcp] AI Browser MCP server running");

  const shutdown = async (): Promise<void> => {
    console.error("[mcp] Shutting down...");
    await shutdownBridge();
    await mcpServer.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[mcp] Fatal error:", err);
  process.exit(1);
});
