import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTabTools } from "./tools/tabs.js";
import { registerDomTools } from "./tools/dom.js";
import { registerInteractionTools } from "./tools/interaction.js";
import { registerCaptureTools } from "./tools/capture.js";
import { registerExecutionTools } from "./tools/execution.js";
import { registerWaitTools } from "./tools/wait.js";
import { registerDialogTools } from "./tools/dialog.js";
import { registerCookieTools } from "./tools/cookies.js";
import { registerStorageTools } from "./tools/storage.js";
import { registerMonitorTools } from "./tools/monitor.js";
import { registerSecretTools } from "./tools/secrets.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "ai-browser",
    version: "0.1.0",
  });

  registerTabTools(server);
  registerDomTools(server);
  registerInteractionTools(server);
  registerCaptureTools(server);
  registerExecutionTools(server);
  registerWaitTools(server);
  registerDialogTools(server);
  registerCookieTools(server);
  registerStorageTools(server);
  registerMonitorTools(server);
  registerSecretTools(server);

  return server;
}
