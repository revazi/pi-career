#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTrustedNpm, sanitizeNpmEnvironment } from "./lib/trusted-tooling.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await resolveTrustedNpm();
const environment = sanitizeNpmEnvironment();
const checks = ["scripts/audit-production.mjs", "scripts/audit-full.mjs", "scripts/check-package.mjs"];

for (const relativeCheck of checks) {
  const absoluteCheck = path.join(root, relativeCheck);
  assert.ok(absoluteCheck.startsWith(`${root}${path.sep}`), "publish check path escaped root");
  execFileSync(process.execPath, [absoluteCheck], {
    cwd: root,
    env: environment,
    shell: false,
    stdio: ["ignore", "inherit", "inherit"],
  });
}
