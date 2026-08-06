// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  FULL_AUDIT_ARGUMENTS,
  PRODUCTION_AUDIT_ARGUMENTS,
  resolveTrustedNpm,
  resolveTrustedTar,
  runTrustedNpm,
  sanitizeNpmEnvironment,
} from "../../scripts/lib/trusted-tooling.mjs";

async function shadowCommand(directory, name, marker) {
  const command = path.join(directory, name);
  await writeFile(command, `#!/bin/sh\nprintf invoked > ${JSON.stringify(marker)}\nprintf shadowed\\n\n`);
  await chmod(command, 0o755);
  return command;
}

async function assertMissing(file) {
  await assert.rejects(access(file), { code: "ENOENT" });
}

test("production and full audits are explicitly strict from low severity upward", () => {
  assert.deepEqual(PRODUCTION_AUDIT_ARGUMENTS, [
    "audit",
    "--omit=dev",
    "--omit=optional",
    "--omit=peer",
    "--audit-level=low",
    "--json",
  ]);
  assert.deepEqual(FULL_AUDIT_ARGUMENTS, ["audit", "--audit-level=low", "--json"]);
});

test("npm environment sanitization removes omit/include/audit-level/NODE_ENV overrides case-insensitively", () => {
  const sanitized = sanitizeNpmEnvironment({
    PATH: "/synthetic/path",
    NODE_ENV: "production",
    npm_config_omit: "dev",
    NPM_CONFIG_INCLUDE: "peer",
    "NpM_CoNfIg_AuDiT-LeVeL": "critical",
    npm_execpath: "/trusted/npm-cli.js",
  });
  assert.deepEqual(sanitized, {
    PATH: "/synthetic/path",
    npm_execpath: "/trusted/npm-cli.js",
  });
});

test("trusted npm uses process.execPath plus its absolute bundled npm CLI and sanitized environment", async () => {
  let invocation;
  const result = await runTrustedNpm(["--version"], {
    environment: {
      ...process.env,
      NODE_ENV: "production",
      npm_config_omit: "dev",
      npm_config_include: "peer",
      npm_config_audit_level: "critical",
    },
    exec: async (command, arguments_, options) => {
      invocation = { command, arguments_, options };
      return { stdout: "10.9.3\n", stderr: "" };
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(invocation.command, process.execPath);
  assert.ok(path.isAbsolute(invocation.arguments_[0]));
  assert.match(invocation.arguments_[0], /[/\\]npm[/\\]bin[/\\]npm-cli\.js$/);
  assert.deepEqual(invocation.arguments_.slice(1), ["--version"]);
  for (const key of Object.keys(invocation.options.env)) {
    assert.equal(
      ["node_env", "npm_config_omit", "npm_config_include", "npm_config_audit_level"].includes(key.toLowerCase()),
      false,
    );
  }
  assert.equal(invocation.options.shell, false);
});

test("npm_execpath must resolve to the npm CLI bundled with the real Node installation", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pi-career-untrusted-npm-execpath-"));
  try {
    const impostor = path.join(temporary, "npm-cli.js");
    await writeFile(impostor, "// synthetic impostor\n");
    await assert.rejects(
      resolveTrustedNpm({ environment: { ...process.env, npm_execpath: impostor } }),
      /npm_execpath must match/,
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

test("PATH-shadowed npm cannot intercept trusted npm execution", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pi-career-shadow-npm-"));
  try {
    const marker = path.join(temporary, "npm-invoked");
    await shadowCommand(temporary, "npm", marker);
    const result = await runTrustedNpm(["--version"], {
      environment: { ...process.env, PATH: temporary },
    });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^\d+\.\d+\.\d+\n$/);
    assert.equal(result.stderr, "");
    await assertMissing(marker);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("PATH-shadowed tar cannot intercept the verified absolute system tar", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pi-career-shadow-tar-"));
  try {
    const marker = path.join(temporary, "tar-invoked");
    await shadowCommand(temporary, "tar", marker);
    const trustedTar = await resolveTrustedTar();
    assert.equal(trustedTar, "/usr/bin/tar");
    const result = spawnSync(trustedTar, ["--version"], {
      encoding: "utf8",
      env: { ...process.env, PATH: temporary },
      shell: false,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.length > 0);
    await assertMissing(marker);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("check:publish is a direct Node orchestrator with no nested npm command", async () => {
  const packageManifest = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(packageManifest.scripts["audit:production"], "node scripts/audit-production.mjs");
  assert.equal(packageManifest.scripts["check:publish"], "node scripts/check-publish.mjs");
  const orchestrator = await readFile(new URL("../../scripts/check-publish.mjs", import.meta.url), "utf8");
  assert.equal(orchestrator.includes("npm run"), false);
  assert.equal(orchestrator.includes("execFileSync(process.execPath"), true);
});
