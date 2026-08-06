// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parseStrictJson } from "./strict-json.mjs";
import { runTrustedNpm } from "./trusted-tooling.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const EXACT_EXPIRY = "2026-08-19T00:00:00.000Z";
const MAX_BASELINE_BYTES = 256 * 1024;
const MAX_LOCKFILE_BYTES = 2 * 1024 * 1024;
const MAX_COMMAND_BYTES = 512 * 1024;

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys`);
}

function nonemptyString(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.length > 0, `${label} must not be empty`);
}

function validateAdvisory(advisory, label) {
  exactKeys(
    advisory,
    ["source", "name", "dependency", "title", "url", "severity", "cwe", "cvss", "range"],
    label,
  );
  assert.ok(Number.isSafeInteger(advisory.source) && advisory.source > 0, `${label}.source`);
  for (const key of ["name", "dependency", "title", "url", "severity", "range"]) {
    nonemptyString(advisory[key], `${label}.${key}`);
  }
  assert.ok(Array.isArray(advisory.cwe) && advisory.cwe.every((item) => typeof item === "string"), `${label}.cwe`);
  exactKeys(advisory.cvss, ["score", "vectorString"], `${label}.cvss`);
  assert.equal(typeof advisory.cvss.score, "number", `${label}.cvss.score`);
  nonemptyString(advisory.cvss.vectorString, `${label}.cvss.vectorString`);
}

function reportCounts(report) {
  exactKeys(report, ["auditReportVersion", "vulnerabilities", "metadata"], "audit_report");
  assert.equal(report.auditReportVersion, 2, "audit report version");
  exactKeys(report.metadata, ["vulnerabilities", "dependencies"], "audit_report.metadata");
  exactKeys(
    report.metadata.vulnerabilities,
    ["info", "low", "moderate", "high", "critical", "total"],
    "audit_report.metadata.vulnerabilities",
  );
  exactKeys(
    report.metadata.dependencies,
    ["prod", "dev", "optional", "peer", "peerOptional", "total"],
    "audit_report.metadata.dependencies",
  );
  for (const value of Object.values(report.metadata.vulnerabilities)) {
    assert.ok(Number.isSafeInteger(value) && value >= 0, "audit vulnerability metadata values");
  }
  for (const value of Object.values(report.metadata.dependencies)) {
    assert.ok(Number.isSafeInteger(value) && value >= 0, "audit dependency metadata values");
  }

  const packages = Object.entries(report.vulnerabilities);
  const severityCounts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  let advisoryCount = 0;
  const packageNodes = [];
  for (const [packageName, vulnerability] of packages) {
    exactKeys(
      vulnerability,
      ["name", "severity", "isDirect", "via", "effects", "range", "nodes", "fixAvailable"],
      `audit_report.vulnerabilities.${packageName}`,
    );
    assert.equal(vulnerability.name, packageName, `vulnerability name for ${packageName}`);
    assert.ok(Object.hasOwn(severityCounts, vulnerability.severity), `vulnerability severity for ${packageName}`);
    severityCounts[vulnerability.severity] += 1;
    assert.equal(typeof vulnerability.isDirect, "boolean", `directness for ${packageName}`);
    nonemptyString(vulnerability.range, `range for ${packageName}`);
    assert.ok(Array.isArray(vulnerability.via), `via for ${packageName}`);
    assert.ok(Array.isArray(vulnerability.effects), `effects for ${packageName}`);
    assert.ok(vulnerability.effects.every((item) => typeof item === "string"), `effects for ${packageName}`);
    assert.ok(Array.isArray(vulnerability.nodes) && vulnerability.nodes.length > 0, `nodes for ${packageName}`);
    for (const nodePath of vulnerability.nodes) {
      nonemptyString(nodePath, `node path for ${packageName}`);
      packageNodes.push({ name: packageName, node_path: nodePath });
    }
    for (const [index, via] of vulnerability.via.entries()) {
      if (typeof via === "string") nonemptyString(via, `via for ${packageName}`);
      else {
        validateAdvisory(via, `advisory ${packageName}[${index}]`);
        advisoryCount += 1;
      }
    }
    assert.ok(
      typeof vulnerability.fixAvailable === "boolean" ||
        (vulnerability.fixAvailable && typeof vulnerability.fixAvailable === "object"),
      `fixAvailable for ${packageName}`,
    );
    if (typeof vulnerability.fixAvailable === "object") {
      exactKeys(vulnerability.fixAvailable, ["name", "version", "isSemVerMajor"], `fixAvailable for ${packageName}`);
      nonemptyString(vulnerability.fixAvailable.name, `fixAvailable name for ${packageName}`);
      nonemptyString(vulnerability.fixAvailable.version, `fixAvailable version for ${packageName}`);
      assert.equal(typeof vulnerability.fixAvailable.isSemVerMajor, "boolean", `fixAvailable major flag for ${packageName}`);
    }
  }

  assert.equal(report.metadata.vulnerabilities.total, packages.length, "metadata vulnerability total");
  for (const [severity, count] of Object.entries(severityCounts)) {
    assert.equal(report.metadata.vulnerabilities[severity], count, `metadata ${severity} count`);
  }
  return { vulnerabilityCount: packages.length, advisoryCount, packageNodes };
}

export function validateBaselineShape(baseline) {
  exactKeys(
    baseline,
    [
      "schema_version",
      "expires_at",
      "tool",
      "lockfile",
      "vulnerability_count",
      "advisory_count",
      "installed_packages",
      "audit_report",
    ],
    "baseline",
  );
  assert.equal(baseline.schema_version, "pi.career.accepted_development_audit.v1");
  assert.equal(baseline.expires_at, EXACT_EXPIRY, "accepted audit expiry");
  assert.equal(Date.parse(baseline.expires_at), Date.parse(EXACT_EXPIRY), "accepted audit expiry timestamp");
  exactKeys(baseline.tool, ["command", "version", "arguments", "expected_exit_code"], "baseline.tool");
  assert.deepEqual(baseline.tool, {
    command: "npm",
    version: "10.9.3",
    arguments: ["audit", "--json"],
    expected_exit_code: 1,
  });
  exactKeys(baseline.lockfile, ["path", "sha256"], "baseline.lockfile");
  assert.equal(baseline.lockfile.path, "package-lock.json");
  assert.match(baseline.lockfile.sha256, SHA256_PATTERN);
  assert.ok(Number.isSafeInteger(baseline.vulnerability_count) && baseline.vulnerability_count >= 0);
  assert.ok(Number.isSafeInteger(baseline.advisory_count) && baseline.advisory_count >= 0);
  assert.ok(Array.isArray(baseline.installed_packages), "installed_packages must be an array");

  const seenNodes = new Set();
  for (const [index, installed] of baseline.installed_packages.entries()) {
    exactKeys(installed, ["name", "node_path", "version"], `installed_packages[${index}]`);
    for (const key of ["name", "node_path", "version"]) nonemptyString(installed[key], `installed_packages[${index}].${key}`);
    assert.ok(!path.isAbsolute(installed.node_path), "installed package path must be relative");
    assert.equal(installed.node_path.split(path.posix.sep).includes(".."), false, "installed package path traversal");
    assert.ok(installed.node_path.startsWith("node_modules/"), "installed package path must be below node_modules");
    assert.equal(seenNodes.has(installed.node_path), false, "duplicate installed package path");
    seenNodes.add(installed.node_path);
  }

  const counts = reportCounts(baseline.audit_report);
  assert.equal(baseline.vulnerability_count, counts.vulnerabilityCount, "baseline vulnerability count");
  assert.equal(baseline.advisory_count, counts.advisoryCount, "baseline advisory count");
  assert.deepEqual(
    baseline.installed_packages.map(({ name, node_path }) => ({ name, node_path })),
    counts.packageNodes,
    "installed packages must exactly cover audit node paths",
  );
  return baseline;
}

export function validateAcceptedDevelopmentAudit({
  baseline,
  now,
  npmVersion,
  auditExitCode,
  auditReport,
  lockfileBytes,
  installedPackages,
}) {
  validateBaselineShape(baseline);
  assert.ok(now instanceof Date && Number.isFinite(now.getTime()), "current time must be valid");
  assert.ok(now.getTime() < Date.parse(baseline.expires_at), `accepted development audit expired at ${baseline.expires_at}`);
  assert.equal(npmVersion, baseline.tool.version, "npm version drift");
  assert.equal(auditExitCode, baseline.tool.expected_exit_code, "npm audit exit-code drift");
  assert.ok(Buffer.isBuffer(lockfileBytes), "lockfile bytes are required");
  assert.equal(createHash("sha256").update(lockfileBytes).digest("hex"), baseline.lockfile.sha256, "lockfile drift");
  assert.ok(isDeepStrictEqual(installedPackages, baseline.installed_packages), "installed package drift");
  reportCounts(auditReport);
  assert.ok(isDeepStrictEqual(auditReport, baseline.audit_report), "npm audit report drift");
  return {
    expiresAt: baseline.expires_at,
    vulnerabilityCount: baseline.vulnerability_count,
    advisoryCount: baseline.advisory_count,
  };
}

async function boundedRead(file, maximumBytes, label) {
  const metadata = await lstat(file);
  assert.ok(metadata.isFile(), `${label} must be a regular file`);
  assert.ok(metadata.size > 0 && metadata.size <= maximumBytes, `${label} size`);
  const bytes = await readFile(file);
  assert.equal(bytes.length, metadata.size, `${label} read size`);
  return bytes;
}

function exactCommandOutput(result, label) {
  assert.ok(result && typeof result === "object", `${label} result`);
  assert.ok(Number.isSafeInteger(result.exitCode) && result.exitCode >= 0, `${label} exit code`);
  assert.equal(typeof result.stdout, "string", `${label} stdout`);
  assert.equal(typeof result.stderr, "string", `${label} stderr`);
  assert.equal(Buffer.byteLength(result.stderr), 0, `${label} stderr must be empty`);
  assert.ok(Buffer.byteLength(result.stdout) > 0 && Buffer.byteLength(result.stdout) <= MAX_COMMAND_BYTES, `${label} stdout size`);
  return result;
}

export async function checkAcceptedDevelopmentAudit({
  root,
  baselinePath,
  expectedBaselineSha256,
  now = new Date(),
  environment = process.env,
  run = runTrustedNpm,
} = {}) {
  assert.ok(path.isAbsolute(root), "audit root must be absolute");
  assert.ok(path.isAbsolute(baselinePath), "audit baseline path must be absolute");
  assert.match(expectedBaselineSha256, SHA256_PATTERN, "expected audit baseline SHA-256");
  const baselineBytes = await boundedRead(baselinePath, MAX_BASELINE_BYTES, "audit baseline");
  assert.equal(
    createHash("sha256").update(baselineBytes).digest("hex"),
    expectedBaselineSha256,
    "accepted audit baseline file drift",
  );
  let baselineText;
  try {
    baselineText = new TextDecoder("utf-8", { fatal: true }).decode(baselineBytes);
  } catch {
    throw new Error("audit baseline must be valid UTF-8 JSON without duplicate decoded keys");
  }
  const baseline = parseStrictJson(baselineText, {
    label: "audit baseline",
    maximumBytes: MAX_BASELINE_BYTES,
  });
  validateBaselineShape(baseline);

  const versionResult = exactCommandOutput(
    await run(["--version"], { cwd: root, environment, maxBuffer: MAX_COMMAND_BYTES }),
    "npm version",
  );
  assert.equal(versionResult.exitCode, 0, "npm version command failed");
  const npmVersion = versionResult.stdout.trim();
  assert.equal(versionResult.stdout, `${npmVersion}\n`, "npm version output");

  const auditResult = exactCommandOutput(
    await run(baseline.tool.arguments, { cwd: root, environment, maxBuffer: MAX_COMMAND_BYTES }),
    "npm audit",
  );
  const auditReport = parseStrictJson(auditResult.stdout, {
    label: "npm audit output",
    maximumBytes: MAX_COMMAND_BYTES,
  });

  const lockfileBytes = await boundedRead(path.join(root, baseline.lockfile.path), MAX_LOCKFILE_BYTES, "package lockfile");
  const installedPackages = [];
  for (const expected of baseline.installed_packages) {
    const packageRoot = path.resolve(root, expected.node_path);
    assert.ok(packageRoot.startsWith(`${root}${path.sep}`), "installed package path escaped root");
    const packageMetadata = await lstat(packageRoot);
    assert.ok(packageMetadata.isDirectory() && !packageMetadata.isSymbolicLink(), "installed package root must be a directory");
    const manifestBytes = await boundedRead(path.join(packageRoot, "package.json"), 256 * 1024, "installed package manifest");
    const manifest = parseStrictJson(manifestBytes.toString("utf8"), {
      label: "installed package manifest",
      maximumBytes: 256 * 1024,
    });
    installedPackages.push({ name: manifest.name, node_path: expected.node_path, version: manifest.version });
  }

  return validateAcceptedDevelopmentAudit({
    baseline,
    now,
    npmVersion,
    auditExitCode: auditResult.exitCode,
    auditReport,
    lockfileBytes,
    installedPackages,
  });
}
