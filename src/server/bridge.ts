import type { BridgeAction, BridgeResponse } from "../shared/protocol.js";
import { createRuntime } from "./runtime.js";

export interface BrowserDriver {
  init(): Promise<void>;
  close(): Promise<void>;
  execute(
    action: BridgeAction,
    params: Record<string, unknown>,
  ): Promise<BridgeResponse>;
}

let driver: BrowserDriver | null = null;

export async function initBridge(): Promise<void> {
  driver = createRuntime();
  await driver.init();
}

export async function shutdownBridge(): Promise<void> {
  await driver?.close();
  driver = null;
}

export async function send(
  action: BridgeAction,
  params: Record<string, unknown> = {},
): Promise<BridgeResponse> {
  if (!driver) {
    return {
      id: "",
      success: false,
      error: "Browser runtime is not initialized",
    };
  }

  return driver.execute(action, params);
}
