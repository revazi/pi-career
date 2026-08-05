#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(scriptDirectory, "..");

export async function buildBundle(outputFile = path.join(repositoryRoot, "dist", "index.js")) {
  await mkdir(path.dirname(outputFile), { recursive: true });
  await build({
    entryPoints: [path.join(repositoryRoot, "src", "index.ts")],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    charset: "utf8",
    sourcemap: false,
    legalComments: "none",
    treeShaking: true,
    external: [
      "@earendil-works/pi-ai",
      "@earendil-works/pi-coding-agent",
      "@earendil-works/pi-tui",
      "typebox",
    ],
    banner: {
      js: "// Generated from src/ by npm run build; do not edit.\n// SPDX-License-Identifier: MIT OR Apache-2.0",
    },
    logLevel: "silent",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await buildBundle();
  process.stdout.write("Built dist/index.js\n");
}
