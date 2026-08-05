#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "pi-career-pack-"));
const allowed = new Set([
  "CHANGELOG.md",
  "LICENSE-APACHE",
  "LICENSE-MIT",
  "NOTICE",
  "README.md",
  "SECURITY.md",
  "dist/index.js",
  "docs/design.md",
  "docs/product-flow.md",
  "package.json",
  "runtime/LICENSE-APACHE",
  "runtime/LICENSE-MIT",
  "runtime/THIRD_PARTY_NOTICES.md",
  "runtime/darwin-arm64/career",
  "runtime/darwin-arm64/provenance.json",
  "runtime/linux-x64-gnu/career",
  "runtime/linux-x64-gnu/provenance.json",
  "runtime/manifest.json",
  "skills/career-core/SKILL.md",
  "skills/career-core/references/cli-contract.md",
]);

function pack(args) {
  const output = execFileSync("npm", ["pack", ...args, "--json", "--ignore-scripts"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.length, 1);
  const names = new Set(parsed[0].files.map(({ path: file }) => file));
  assert.deepEqual(names, allowed);
  assert.ok(parsed[0].size < 4_000_000, "packed artifact must remain below 4 MB");
  assert.ok(parsed[0].unpackedSize < 11_000_000, "unpacked artifact must remain below 11 MB");
  return parsed[0];
}

try {
  pack(["--dry-run"]);
  const artifact = pack(["--pack-destination", temporaryDirectory]);
  const artifactPath = path.join(temporaryDirectory, artifact.filename);
  assert.ok((await stat(artifactPath)).size > 0);
  const tarEntries = execFileSync("tar", ["-tzf", artifactPath], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((entry) => entry && !entry.endsWith("/"))
    .map((entry) => entry.replace(/^package\//, ""));
  assert.deepEqual(new Set(tarEntries), allowed);

  const extracted = path.join(temporaryDirectory, "extracted");
  await mkdir(extracted);
  execFileSync("tar", ["-xzf", artifactPath, "-C", extracted]);
  const packageRoot = path.join(extracted, "package");
  await assert.rejects(access(path.join(packageRoot, "node_modules")));
  const packagedManifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  assert.equal(packagedManifest.private, true, "package.json private must guard npm publication");
  assert.equal(packagedManifest.dependencies, undefined);
  for (const lifecycle of [
    "preinstall",
    "install",
    "postinstall",
    "prepare",
    "prepack",
    "postpack",
    "prepublish",
    "prepublishOnly",
    "publish",
    "postpublish",
  ]) assert.equal(packagedManifest.scripts?.[lifecycle], undefined, `lifecycle script ${lifecycle} is forbidden`);
  assert.equal((await stat(path.join(packageRoot, "runtime", "darwin-arm64", "career"))).mode & 0o777, 0o755);
  assert.equal((await stat(path.join(packageRoot, "runtime", "linux-x64-gnu", "career"))).mode & 0o777, 0o755);
  execFileSync(process.execPath, [path.join(root, "scripts", "check-runtime-artifacts.mjs")], {
    cwd: temporaryDirectory,
    env: { ...process.env, PI_CAREER_PACKAGE_ROOT: packageRoot },
    stdio: ["ignore", "inherit", "inherit"],
  });
  execFileSync(process.execPath, [path.join(root, "scripts", "test-pi-package-load.mjs")], {
    cwd: temporaryDirectory,
    env: {
      ...process.env,
      PI_CAREER_PACKAGE_ROOT: packageRoot,
      PI_OFFLINE: "1",
      PI_TELEMETRY: "0",
      PI_SKIP_VERSION_CHECK: "1",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  execFileSync(process.execPath, [path.join(root, "scripts", "test-bundled-runtime.mjs")], {
    cwd: temporaryDirectory,
    env: {
      ...process.env,
      PI_CAREER_PACKAGE_ROOT: packageRoot,
      PI_OFFLINE: "1",
      PI_TELEMETRY: "0",
      PI_SKIP_VERSION_CHECK: "1",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  process.stdout.write(
    `Verified package artifact ${artifact.filename} (${artifact.size} bytes compressed, ${artifact.unpackedSize} bytes unpacked)\n`,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
