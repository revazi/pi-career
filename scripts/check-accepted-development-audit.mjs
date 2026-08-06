#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkAcceptedDevelopmentAudit } from "./lib/accepted-development-audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = await checkAcceptedDevelopmentAudit({
  root,
  baselinePath: path.join(root, "audit", "accepted-development-audit.json"),
  expectedBaselineSha256: "74d17f641b7b5d608540f3ec2931b38fc2d74fa8259a251a019f9e08f65631eb",
});

process.stdout.write(
  `Accepted exact temporary development-only risk baseline (not a clean full audit): ${result.vulnerabilityCount} vulnerable packages, ${result.advisoryCount} advisories, expires ${result.expiresAt}\n`,
);
