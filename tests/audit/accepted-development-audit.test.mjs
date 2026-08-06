// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  checkAcceptedDevelopmentAudit,
  validateAcceptedDevelopmentAudit,
  validateBaselineShape,
} from "../../scripts/lib/accepted-development-audit.mjs";
import { runTrustedNpm } from "../../scripts/lib/trusted-tooling.mjs";

const lockfileBytes = Buffer.from('{"synthetic":"lock"}\n');

function report() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      "direct-tool": {
        name: "direct-tool",
        severity: "moderate",
        isDirect: true,
        via: ["nested-lib"],
        effects: [],
        range: ">=1.0.0",
        nodes: ["node_modules/direct-tool"],
        fixAvailable: { name: "direct-tool", version: "0.9.0", isSemVerMajor: true },
      },
      "nested-lib": {
        name: "nested-lib",
        severity: "high",
        isDirect: false,
        via: [
          {
            source: 1234567,
            name: "nested-lib",
            dependency: "nested-lib",
            title: "Synthetic denial of service",
            url: "https://example.invalid/GHSA-synthetic",
            severity: "high",
            cwe: ["CWE-400"],
            cvss: { score: 7.5, vectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H" },
            range: ">=2.0.0 <2.0.2",
          },
        ],
        effects: ["direct-tool"],
        range: "2.0.0 - 2.0.1",
        nodes: ["node_modules/direct-tool/node_modules/nested-lib"],
        fixAvailable: true,
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 1, high: 1, critical: 0, total: 2 },
      dependencies: { prod: 1, dev: 2, optional: 0, peer: 0, peerOptional: 0, total: 2 },
    },
  };
}

function baseline() {
  return {
    schema_version: "pi.career.accepted_development_audit.v1",
    expires_at: "2026-08-19T00:00:00.000Z",
    tool: { command: "npm", version: "10.9.3", arguments: ["audit", "--json"], expected_exit_code: 1 },
    lockfile: {
      path: "package-lock.json",
      sha256: createHash("sha256").update(lockfileBytes).digest("hex"),
    },
    vulnerability_count: 2,
    advisory_count: 1,
    installed_packages: [
      { name: "direct-tool", node_path: "node_modules/direct-tool", version: "1.0.0" },
      {
        name: "nested-lib",
        node_path: "node_modules/direct-tool/node_modules/nested-lib",
        version: "2.0.1",
      },
    ],
    audit_report: report(),
  };
}

function input() {
  const accepted = baseline();
  return {
    baseline: accepted,
    now: new Date("2026-08-18T23:59:59.999Z"),
    npmVersion: "10.9.3",
    auditExitCode: 1,
    auditReport: structuredClone(accepted.audit_report),
    lockfileBytes,
    installedPackages: structuredClone(accepted.installed_packages),
  };
}

function rejectsMutation(name, mutate) {
  test(name, () => {
    const value = input();
    mutate(value);
    assert.throws(() => validateAcceptedDevelopmentAudit(value));
  });
}

test("accepts only the exact unexpired synthetic development audit", () => {
  assert.deepEqual(validateAcceptedDevelopmentAudit(input()), {
    expiresAt: "2026-08-19T00:00:00.000Z",
    vulnerabilityCount: 2,
    advisoryCount: 1,
  });
});

rejectsMutation("rejects expiry at the exact boundary", (value) => {
  value.now = new Date("2026-08-19T00:00:00.000Z");
});
rejectsMutation("rejects a vulnerable package mismatch", (value) => {
  value.auditReport.vulnerabilities["other-package"] = value.auditReport.vulnerabilities["nested-lib"];
  delete value.auditReport.vulnerabilities["nested-lib"];
});
rejectsMutation("rejects installed version drift", (value) => {
  value.installedPackages[1].version = "2.0.0";
});
rejectsMutation("rejects advisory identity drift", (value) => {
  value.auditReport.vulnerabilities["nested-lib"].via[0].source += 1;
});
rejectsMutation("rejects advisory detail drift", (value) => {
  value.auditReport.vulnerabilities["nested-lib"].via[0].title += " changed";
});
rejectsMutation("rejects severity drift", (value) => {
  value.auditReport.vulnerabilities["nested-lib"].severity = "moderate";
});
rejectsMutation("rejects node path drift", (value) => {
  value.auditReport.vulnerabilities["nested-lib"].nodes[0] += "-other";
});
rejectsMutation("rejects affected range drift", (value) => {
  value.auditReport.vulnerabilities["nested-lib"].range = ">=2.0.0";
});
rejectsMutation("rejects directness drift", (value) => {
  value.auditReport.vulnerabilities["nested-lib"].isDirect = true;
});
rejectsMutation("rejects vulnerability metadata count drift", (value) => {
  value.auditReport.metadata.vulnerabilities.total += 1;
});
rejectsMutation("rejects advisory count drift", (value) => {
  value.baseline.advisory_count += 1;
});
rejectsMutation("rejects lockfile drift", (value) => {
  value.lockfileBytes = Buffer.from("different synthetic lock");
});
rejectsMutation("rejects npm version drift", (value) => {
  value.npmVersion = "11.0.0";
});
rejectsMutation("rejects unexpected npm audit success", (value) => {
  value.auditExitCode = 0;
});

test("rejects a malformed baseline", () => {
  assert.throws(() => validateBaselineShape({ schema_version: "wrong" }));
});

test("rejects checked-in baseline file drift", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pi-career-audit-baseline-drift-"));
  try {
    const baselinePath = path.join(temporary, "baseline.json");
    await writeFile(baselinePath, `${JSON.stringify(baseline())}\n`);
    await assert.rejects(
      checkAcceptedDevelopmentAudit({
        root: temporary,
        baselinePath,
        expectedBaselineSha256: "0".repeat(64),
        now: new Date("2026-08-18T00:00:00.000Z"),
      }),
      /baseline file drift/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("rejects duplicate decoded keys in the checked-in baseline", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pi-career-audit-duplicate-baseline-"));
  try {
    const baselinePath = path.join(temporary, "baseline.json");
    const baselineText = JSON.stringify(baseline()).replace(
      '{"schema_version":',
      '{"\\u0073chema_version":"shadowed","schema_version":',
    );
    const baselineBytes = Buffer.from(`${baselineText}\n`);
    await writeFile(baselinePath, baselineBytes);
    await assert.rejects(
      checkAcceptedDevelopmentAudit({
        root: temporary,
        baselinePath,
        expectedBaselineSha256: createHash("sha256").update(baselineBytes).digest("hex"),
        now: new Date("2026-08-18T00:00:00.000Z"),
      }),
      /duplicate decoded key "schema_version"/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("rejects malformed npm audit JSON", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pi-career-audit-malformed-"));
  try {
    const baselinePath = path.join(temporary, "baseline.json");
    const baselineBytes = Buffer.from(`${JSON.stringify(baseline())}\n`);
    await writeFile(baselinePath, baselineBytes);
    let call = 0;
    await assert.rejects(
      checkAcceptedDevelopmentAudit({
        root: temporary,
        baselinePath,
        expectedBaselineSha256: createHash("sha256").update(baselineBytes).digest("hex"),
        now: new Date("2026-08-18T00:00:00.000Z"),
        run: async () => {
          call += 1;
          return call === 1
            ? { exitCode: 0, stdout: "10.9.3\n", stderr: "" }
            : { exitCode: 1, stdout: "{not-json", stderr: "" };
        },
      }),
      /valid JSON/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("rejects duplicate decoded keys in npm audit output", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pi-career-audit-duplicate-report-"));
  try {
    const baselinePath = path.join(temporary, "baseline.json");
    const baselineBytes = Buffer.from(`${JSON.stringify(baseline())}\n`);
    await writeFile(baselinePath, baselineBytes);
    let call = 0;
    const duplicateReport = JSON.stringify(report()).replace(
      '"name":"nested-lib","severity":"high","isDirect":false',
      '"name":"nested-lib","\\u0073everity":"low","severity":"high","isDirect":false',
    );
    await assert.rejects(
      checkAcceptedDevelopmentAudit({
        root: temporary,
        baselinePath,
        expectedBaselineSha256: createHash("sha256").update(baselineBytes).digest("hex"),
        now: new Date("2026-08-18T00:00:00.000Z"),
        run: async () => {
          call += 1;
          return call === 1
            ? { exitCode: 0, stdout: "10.9.3\n", stderr: "" }
            : { exitCode: 1, stdout: duplicateReport, stderr: "" };
        },
      }),
      /duplicate decoded key "severity"/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("rejects trusted npm command execution failure", async () => {
  await assert.rejects(
    runTrustedNpm(["--version"], {
      cwd: process.cwd(),
      exec: async () => {
        const error = new Error("synthetic execution failure");
        error.code = "ENOENT";
        throw error;
      },
    }),
    /failed to execute/,
  );
});
