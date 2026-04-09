#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entrypoint = resolve(here, "../dist/server/index.js");

if (!existsSync(entrypoint)) {
  console.error(
    "[ai-browser] dist/server/index.js not found. If you are running from a git checkout, run 'npm install && npm run build' first.",
  );
  process.exit(1);
}

await import(pathToFileURL(entrypoint).href);
