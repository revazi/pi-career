// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { checkZeroAudit, validateZeroAuditReport } from "../../scripts/lib/zero-audit.mjs";

function report() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
      dependencies: { prod: 1, dev: 10, optional: 2, peer: 0, peerOptional: 0, total: 10 },
    },
  };
}

test("accepts an exact zero-vulnerability audit report", () => {
  assert.deepEqual(validateZeroAuditReport(report(), "synthetic audit"), report());
});

test("rejects nonzero vulnerability metadata", () => {
  const value = report();
  value.metadata.vulnerabilities.high = 1;
  value.metadata.vulnerabilities.total = 1;
  assert.throws(() => validateZeroAuditReport(value, "synthetic audit"), /high vulnerabilities/);
});

test("rejects duplicate decoded keys in npm audit output", async () => {
  const duplicate = JSON.stringify(report()).replace(
    '"vulnerabilities":{},',
    '"\\u0076ulnerabilities":{"shadowed":true},"vulnerabilities":{},',
  );
  await assert.rejects(
    checkZeroAudit({
      arguments_: ["audit", "--json"],
      label: "synthetic audit",
      run: async () => ({ exitCode: 0, stdout: duplicate, stderr: "" }),
    }),
    /duplicate decoded key "vulnerabilities"/,
  );
});

test("rejects nonzero audit command exit status", async () => {
  await assert.rejects(
    checkZeroAudit({
      arguments_: ["audit", "--json"],
      label: "synthetic audit",
      run: async () => ({ exitCode: 1, stdout: JSON.stringify(report()), stderr: "" }),
    }),
    /command failed/,
  );
});
