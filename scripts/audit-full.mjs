#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import { FULL_AUDIT_ARGUMENTS } from "./lib/trusted-tooling.mjs";
import { checkZeroAudit } from "./lib/zero-audit.mjs";

await checkZeroAudit({ arguments_: FULL_AUDIT_ARGUMENTS, label: "full npm audit" });
process.stdout.write("found 0 vulnerabilities\n");
