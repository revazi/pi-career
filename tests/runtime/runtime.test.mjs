// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CareerInvocationError } from "../../src/errors.ts";
import {
  CAREER_PACKAGE_SPEC,
  clearRuntimeResolutionCache,
  resolveCareerExecutable,
  resolveCareerRuntime,
} from "../../src/runtime.ts";

function expectedError(code) {
  return (error) => {
    assert.ok(error instanceof CareerInvocationError);
    const payload = JSON.parse(error.message);
    assert.equal(payload.schema_version, "career.pi_error.v1");
    assert.equal(payload.code, code);
    assert.deepEqual(Object.keys(payload).sort(), ["code", "message", "schema_version"]);
    return true;
  };
}

async function executable(file) {
  await writeFile(file, "#!/bin/sh\nexit 0\n");
  await chmod(file, 0o755);
  return file;
}

async function launcherPackage(root) {
  const packageRoot = path.join(root, "node_modules", "@revazi", "career");
  const binRoot = path.join(packageRoot, "bin");
  await mkdir(binRoot, { recursive: true });
  const manifestPath = path.join(packageRoot, "package.json");
  const launcherPath = path.join(binRoot, "career.js");
  await writeFile(manifestPath, `${JSON.stringify({
    name: "@revazi/career",
    version: "0.1.0",
    bin: { career: "bin/career.js" },
    career_launcher: {
      schema_version: "career.npm_launcher.v1",
      executable: "career",
      platform_packages: ["@revazi/career-darwin-arm64", "@revazi/career-linux-x64-gnu"],
    },
  })}\n`);
  await writeFile(launcherPath, "#!/usr/bin/env node\n");
  await chmod(launcherPath, 0o755);
  return { launcherPath, manifestPath };
}

test("pins the reviewed external Career package coordinate", () => {
  assert.equal(CAREER_PACKAGE_SPEC, "@revazi/career@0.1.0");
});

test("validates an explicit CAREER_CLI_PATH and never falls back from incompatibility", async () => {
  clearRuntimeResolutionCache();
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-career-explicit-"));
  try {
    const career = await executable(path.join(root, "career"));
    assert.equal(resolveCareerExecutable({ CAREER_CLI_PATH: career }), career);
    assert.throws(
      () => resolveCareerExecutable({ CAREER_CLI_PATH: "relative/career" }),
      expectedError("invalid_executable_override"),
    );
    let acquisitionAttempts = 0;
    await assert.rejects(
      resolveCareerRuntime({
        environment: { CAREER_CLI_PATH: career, PATH: "", PI_OFFLINE: "0" },
        probe: async () => { throw new Error("incompatible"); },
        dependencies: {
          resolvePackageManifest: () => undefined,
          acquireLauncher: async () => {
            acquisitionAttempts += 1;
            return "unreachable";
          },
        },
      }),
      expectedError("managed_contract_invalid"),
    );
    assert.equal(acquisitionAttempts, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolves PATH first, caches in memory, and invalidates when PATH changes", async () => {
  clearRuntimeResolutionCache();
  const firstRoot = await mkdtemp(path.join(os.tmpdir(), "pi-career-path-first-"));
  const secondRoot = await mkdtemp(path.join(os.tmpdir(), "pi-career-path-second-"));
  try {
    const first = await executable(path.join(firstRoot, "career"));
    const second = await executable(path.join(secondRoot, "career"));
    let probes = 0;
    const probe = async () => { probes += 1; };
    const firstEnvironment = { PATH: firstRoot, PI_OFFLINE: "1" };
    const firstRoute = await resolveCareerRuntime({ environment: firstEnvironment, probe });
    assert.equal(firstRoute.source, "path");
    assert.equal(firstRoute.command, first);
    assert.equal((await resolveCareerRuntime({ environment: firstEnvironment, probe })).command, first);
    assert.equal(probes, 1);

    const secondRoute = await resolveCareerRuntime({
      environment: { PATH: secondRoot, PI_OFFLINE: "1" },
      probe,
    });
    assert.equal(secondRoute.command, second);
    assert.equal(probes, 2);
  } finally {
    clearRuntimeResolutionCache();
    await rm(firstRoot, { recursive: true, force: true });
    await rm(secondRoot, { recursive: true, force: true });
  }
});

test("skips an incompatible PATH route and uses the exact package-local launcher", async () => {
  clearRuntimeResolutionCache();
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-career-package-local-"));
  try {
    await executable(path.join(root, "career"));
    const local = await launcherPackage(root);
    const seen = [];
    const resolved = await resolveCareerRuntime({
      environment: { PATH: root, PI_OFFLINE: "1" },
      probe: async (candidate) => {
        seen.push(candidate.source);
        if (candidate.source === "path") throw new Error("incompatible PATH career");
      },
      dependencies: {
        resolvePackageManifest: () => local.manifestPath,
        execPath: process.execPath,
      },
    });
    assert.deepEqual(seen, ["path", "package-local"]);
    assert.equal(resolved.source, "package-local");
    assert.deepEqual(resolved.argumentPrefix, [local.launcherPath]);
    assert.equal(resolved.command, await (await import("node:fs/promises")).realpath(process.execPath));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uses acquisition only after local routes fail and executes the acquired launcher directly", async () => {
  clearRuntimeResolutionCache();
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-career-acquired-"));
  try {
    const acquired = await launcherPackage(root);
    let acquisitions = 0;
    const resolved = await resolveCareerRuntime({
      environment: { PATH: "", PI_OFFLINE: "0" },
      probe: async () => {},
      dependencies: {
        resolvePackageManifest: () => undefined,
        acquireLauncher: async () => {
          acquisitions += 1;
          return acquired.launcherPath;
        },
      },
    });
    assert.equal(acquisitions, 1);
    assert.equal(resolved.source, "acquired");
    assert.deepEqual(resolved.argumentPrefix, [acquired.launcherPath]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PI_OFFLINE=1 disables acquisition with stable installation guidance", async () => {
  clearRuntimeResolutionCache();
  let acquisitions = 0;
  await assert.rejects(
    resolveCareerRuntime({
      environment: { PATH: "", PI_OFFLINE: "1" },
      probe: async () => {},
      dependencies: {
        resolvePackageManifest: () => undefined,
        acquireLauncher: async () => {
          acquisitions += 1;
          return "unreachable";
        },
      },
    }),
    expectedError("runtime_unavailable"),
  );
  assert.equal(acquisitions, 0);
});

test("cancellation and timeout during compatibility probing never advance routes", async (t) => {
  for (const code of ["cancelled", "timeout"]) {
    await t.test(code, async () => {
      clearRuntimeResolutionCache();
      const root = await mkdtemp(path.join(os.tmpdir(), `pi-career-${code}-`));
      try {
        await executable(path.join(root, "career"));
        let acquisitions = 0;
        await assert.rejects(
          resolveCareerRuntime({
            environment: { PATH: root, PI_OFFLINE: "0" },
            probe: async () => {
              throw new CareerInvocationError({
                schema_version: "career.pi_error.v1",
                code,
                message: "synthetic terminal probe error",
              });
            },
            dependencies: {
              resolvePackageManifest: () => undefined,
              acquireLauncher: async () => {
                acquisitions += 1;
                return "unreachable";
              },
            },
          }),
          expectedError(code),
        );
        assert.equal(acquisitions, 0);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test("runtime npm acquisition rejects a conflicting npm_execpath before network use", async () => {
  clearRuntimeResolutionCache();
  await assert.rejects(
    resolveCareerRuntime({
      environment: {
        PATH: "",
        PI_OFFLINE: "0",
        npm_execpath: path.join(os.tmpdir(), "untrusted-npm-cli.js"),
      },
      probe: async () => {},
      dependencies: { resolvePackageManifest: () => undefined },
    }),
    expectedError("runtime_acquisition_failed"),
  );
});
