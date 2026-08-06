#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { PRODUCTION_AUDIT_ARGUMENTS, runTrustedNpm } from "./lib/trusted-tooling.mjs";

const result = await runTrustedNpm(PRODUCTION_AUDIT_ARGUMENTS);
assert.equal(typeof result.stdout, "string", "production audit stdout");
assert.equal(typeof result.stderr, "string", "production audit stderr");
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (result.exitCode !== 0) process.exitCode = result.exitCode;
