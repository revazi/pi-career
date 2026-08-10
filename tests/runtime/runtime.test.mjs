// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CareerInvocationError } from "../../src/errors.ts";
import {
  CAREER_PACKAGE_SPEC,
  clearRuntimeResolutionCache,
  decodeAcquiredLauncherOutput,
  resolveCareerExecutable,
  resolveCareerRuntime,
  terminateAcquisitionProcessTree,
} from "../../src/runtime.ts";

const platformPackages = [
  "@revazi/career-darwin-arm64",
  "@revazi/career-darwin-x64",
  "@revazi/career-linux-x64-gnu",
  "@revazi/career-linux-arm64-gnu",
  "@revazi/career-linux-x64-musl",
  "@revazi/career-linux-arm64-musl",
  "@revazi/career-win32-x64-msvc",
  "@revazi/career-win32-arm64-msvc",
];

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
    version: "0.1.1",
    bin: { career: "bin/career.js" },
    files: [
      "bin/career.js",
      "targets.json",
      "README.md",
      "LICENSE-MIT",
      "LICENSE-APACHE",
      "THIRD_PARTY_NOTICES.md",
    ],
    optionalDependencies: Object.fromEntries(platformPackages.map((name) => [name, "0.1.1"])),
    career_launcher: {
      schema_version: "career.npm_launcher.v2",
      executable: "career",
      target_catalog: "targets.json",
      platform_packages: platformPackages,
    },
  })}\n`);
  await writeFile(launcherPath, "#!/usr/bin/env node\n");
  await chmod(launcherPath, 0o755);
  return { launcherPath, manifestPath };
}

test("pins the reviewed external Career package coordinate", () => {
  assert.equal(CAREER_PACKAGE_SPEC, "@revazi/career@0.1.1");
});

test("derives exactly one launcher from the controlled npm acquisition PATH", () => {
  const modules = path.resolve(os.tmpdir(), "synthetic-acquired", "node_modules");
  const bin = path.join(modules, ".bin");
  const launcher = path.join(modules, "@revazi", "career", "bin", "career.js");
  const controlledPath = [bin, path.dirname(process.execPath)].join(path.delimiter);
  assert.equal(
    decodeAcquiredLauncherOutput([
      Buffer.from(`bounded npm banner\r\n${controlledPath}\r\n`, "utf8"),
    ]),
    launcher,
  );
  for (const output of [
    `${controlledPath}\n${controlledPath}\n`,
    `${path.resolve(os.tmpdir(), "not-a-bin-directory")}\n`,
    `relative${path.delimiter}entries\n`,
    "npm banner only\n",
  ]) {
    assert.throws(
      () => decodeAcquiredLauncherOutput([Buffer.from(output, "utf8")]),
      expectedError("runtime_acquisition_failed"),
    );
  }
});

test("rejects altered launcher v2 metadata before compatibility probing", async (t) => {
  const cases = [
    ["obsolete schema", (manifest) => {
      manifest.career_launcher.schema_version = "career.npm_launcher.v1";
      delete manifest.career_launcher.target_catalog;
    }],
    ["reordered platform catalog", (manifest) => {
      manifest.career_launcher.platform_packages.reverse();
    }],
    ["extra optional package", (manifest) => {
      manifest.optionalDependencies["@revazi/career-unreviewed"] = "0.1.1";
    }],
    ["non-lockstep native version", (manifest) => {
      manifest.optionalDependencies[platformPackages[0]] = "0.1.0";
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      clearRuntimeResolutionCache();
      const root = await mkdtemp(path.join(os.tmpdir(), "pi-career-altered-launcher-"));
      try {
        const local = await launcherPackage(root);
        const manifest = JSON.parse(await readFile(local.manifestPath, "utf8"));
        mutate(manifest);
        await writeFile(local.manifestPath, `${JSON.stringify(manifest)}\n`);
        let probes = 0;
        await assert.rejects(
          resolveCareerRuntime({
            environment: { PATH: "", PI_OFFLINE: "1" },
            probe: async () => { probes += 1; },
            dependencies: { resolvePackageManifest: () => local.manifestPath },
          }),
          expectedError("runtime_unavailable"),
        );
        assert.equal(probes, 0);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
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

test("Windows acquisition cancellation reaches process-group descendants", {
  skip: process.platform !== "win32",
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-career-windows-process-group-"));
  const pidFile = path.join(root, "descendant.pid");
  let descendantPid;
  const parent = spawn(process.execPath, ["-e", `
    const { spawn } = require("node:child_process");
    const fs = require("node:fs");
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      detached: false,
      stdio: "ignore",
      windowsHide: true,
    });
    fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
    setInterval(() => {}, 1000);
  `], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  const parentClosed = new Promise((resolve) => parent.once("close", resolve));
  try {
    const deadline = Date.now() + 5_000;
    while (descendantPid === undefined && Date.now() < deadline) {
      try {
        descendantPid = Number.parseInt(await readFile(pidFile, "utf8"), 10);
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 0, "descendant pid");
    terminateAcquisitionProcessTree(parent, "SIGTERM");
    await Promise.race([
      parentClosed,
      new Promise((_, reject) => setTimeout(() => reject(new Error("parent did not close")), 5_000)),
    ]);
    const descendantDeadline = Date.now() + 5_000;
    let descendantAlive = true;
    while (descendantAlive && Date.now() < descendantDeadline) {
      try {
        process.kill(descendantPid, 0);
        await new Promise((resolve) => setTimeout(resolve, 25));
      } catch {
        descendantAlive = false;
      }
    }
    assert.equal(descendantAlive, false, "CTRL_BREAK must terminate the acquisition descendant");
  } finally {
    try { terminateAcquisitionProcessTree(parent, "SIGKILL"); } catch {}
    if (Number.isSafeInteger(descendantPid)) {
      try { process.kill(descendantPid, "SIGKILL"); } catch {}
    }
    await rm(root, { recursive: true, force: true });
  }
});
