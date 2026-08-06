// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { parseStrictJson } from "./strict-json.mjs";
import { runTrustedNpm } from "./trusted-tooling.mjs";

const MAX_AUDIT_BYTES = 512 * 1024;
const VULNERABILITY_KEYS = ["info", "low", "moderate", "high", "critical", "total"];
const DEPENDENCY_KEYS = ["prod", "dev", "optional", "peer", "peerOptional", "total"];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys`);
}

export function validateZeroAuditReport(report, label) {
  exactKeys(report, ["auditReportVersion", "vulnerabilities", "metadata"], label);
  assert.equal(report.auditReportVersion, 2, `${label} version`);
  exactKeys(report.vulnerabilities, [], `${label}.vulnerabilities`);
  exactKeys(report.metadata, ["vulnerabilities", "dependencies"], `${label}.metadata`);
  exactKeys(report.metadata.vulnerabilities, VULNERABILITY_KEYS, `${label}.metadata.vulnerabilities`);
  exactKeys(report.metadata.dependencies, DEPENDENCY_KEYS, `${label}.metadata.dependencies`);
  for (const key of VULNERABILITY_KEYS) {
    assert.equal(report.metadata.vulnerabilities[key], 0, `${label} ${key} vulnerabilities`);
  }
  for (const key of DEPENDENCY_KEYS) {
    assert.ok(
      Number.isSafeInteger(report.metadata.dependencies[key]) && report.metadata.dependencies[key] >= 0,
      `${label} dependency count ${key}`,
    );
  }
  return report;
}

export async function checkZeroAudit({ arguments_, label, environment = process.env, run = runTrustedNpm }) {
  assert.ok(Array.isArray(arguments_) && arguments_.every((argument) => typeof argument === "string"), `${label} arguments`);
  assert.equal(typeof label, "string");
  assert.ok(label.length > 0);
  const result = await run(arguments_, { environment, maxBuffer: MAX_AUDIT_BYTES });
  assert.ok(result && typeof result === "object", `${label} command result`);
  assert.ok(Number.isSafeInteger(result.exitCode) && result.exitCode >= 0, `${label} command exit code`);
  assert.equal(typeof result.stdout, "string", `${label} stdout`);
  assert.equal(typeof result.stderr, "string", `${label} stderr`);
  assert.equal(result.stderr, "", `${label} stderr must be empty`);
  const report = parseStrictJson(result.stdout, { label, maximumBytes: MAX_AUDIT_BYTES });
  validateZeroAuditReport(report, label);
  assert.equal(result.exitCode, 0, `${label} command failed`);
  return report;
}
