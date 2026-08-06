// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, realpath, readlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TRUSTED_TAR_PATH = "/usr/bin/tar";
const FORBIDDEN_NPM_ENVIRONMENT = new Set([
  "node_env",
  "npm_config_audit_level",
  "npm_config_include",
  "npm_config_omit",
]);

export const PRODUCTION_AUDIT_ARGUMENTS = Object.freeze([
  "audit",
  "--omit=dev",
  "--omit=optional",
  "--omit=peer",
  "--audit-level=low",
  "--json",
]);

export const FULL_AUDIT_ARGUMENTS = Object.freeze(["audit", "--audit-level=low", "--json"]);

function assertExecutableRegularFile(metadata, label) {
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), `${label} must be a regular file`);
  assert.ok((metadata.mode & 0o111) !== 0, `${label} must be executable`);
}

export function sanitizeNpmEnvironment(environment = process.env) {
  assert.ok(environment && typeof environment === "object", "npm environment must be an object");
  return Object.fromEntries(
    Object.entries(environment).filter(([key, value]) => {
      assert.equal(typeof value, "string", `environment ${key} must be a string`);
      return !FORBIDDEN_NPM_ENVIRONMENT.has(key.toLowerCase().replaceAll("-", "_"));
    }),
  );
}

function npmExecPathValues(environment) {
  return Object.entries(environment)
    .filter(([key]) => key.toLowerCase() === "npm_execpath")
    .map(([, value]) => value);
}

export async function resolveTrustedNpm({ execPath = process.execPath, environment = process.env } = {}) {
  assert.ok(path.isAbsolute(execPath), "process.execPath must be absolute");
  const realNodePath = await realpath(execPath);
  assertExecutableRegularFile(await lstat(realNodePath), "Node executable");
  const prefix = path.dirname(path.dirname(realNodePath));
  const derivedNpmCliPath = path.join(prefix, "lib", "node_modules", "npm", "bin", "npm-cli.js");
  const realNpmCliPath = await realpath(derivedNpmCliPath);
  assert.equal(realNpmCliPath, derivedNpmCliPath, "derived npm CLI must not resolve outside its Node installation path");
  assertExecutableRegularFile(await lstat(realNpmCliPath), "derived npm CLI");

  const suppliedNpmExecPaths = npmExecPathValues(environment);
  assert.ok(suppliedNpmExecPaths.length <= 1, "npm_execpath must not be ambiguous");
  if (suppliedNpmExecPaths.length === 1) {
    const supplied = suppliedNpmExecPaths[0];
    assert.equal(typeof supplied, "string", "npm_execpath must be a string");
    assert.ok(path.isAbsolute(supplied), "npm_execpath must be absolute");
    assert.equal(await realpath(supplied), realNpmCliPath, "npm_execpath must match the npm CLI bundled with process.execPath");
  }

  return Object.freeze({ nodePath: execPath, realNodePath, npmCliPath: realNpmCliPath, prefix });
}

export async function runTrustedNpm(
  arguments_,
  {
    cwd,
    environment = process.env,
    exec = execFileAsync,
    maxBuffer = 512 * 1024,
    timeout = 120_000,
  } = {},
) {
  assert.ok(Array.isArray(arguments_) && arguments_.every((argument) => typeof argument === "string"), "npm arguments");
  const trusted = await resolveTrustedNpm({ environment });
  const options = {
    cwd,
    encoding: "utf8",
    env: sanitizeNpmEnvironment(environment),
    maxBuffer,
    shell: false,
    timeout,
    windowsHide: true,
  };
  try {
    const result = await exec(trusted.nodePath, [trusted.npmCliPath, ...arguments_], options);
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    if (!Number.isSafeInteger(error?.code)) throw new Error("trusted npm command failed to execute");
    return { exitCode: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

export async function resolveTrustedTar() {
  const entryMetadata = await lstat(TRUSTED_TAR_PATH);
  assert.equal(entryMetadata.uid, 0, "trusted tar entry must be root-owned");
  assert.ok(entryMetadata.isFile() || entryMetadata.isSymbolicLink(), "trusted tar entry type");
  if (entryMetadata.isSymbolicLink()) {
    const target = await readlink(TRUSTED_TAR_PATH);
    assert.ok(!path.isAbsolute(target) && !target.split(path.sep).includes(".."), "trusted tar link target");
  }
  const realTarPath = await realpath(TRUSTED_TAR_PATH);
  assert.equal(path.dirname(realTarPath), "/usr/bin", "trusted tar target must remain in /usr/bin");
  const targetMetadata = await lstat(realTarPath);
  assert.equal(targetMetadata.uid, 0, "trusted tar target must be root-owned");
  assertExecutableRegularFile(targetMetadata, "trusted tar target");
  return TRUSTED_TAR_PATH;
}
