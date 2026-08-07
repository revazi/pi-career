#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStrictJson } from "./lib/strict-json.mjs";
import { resolveTrustedNpm, resolveTrustedTar, sanitizeNpmEnvironment } from "./lib/trusted-tooling.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const trustedNpm = await resolveTrustedNpm();
const trustedTar = await resolveTrustedTar();
const trustedNpmEnvironment = sanitizeNpmEnvironment();
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "pi-career-pack-"));
const expectedExternalPeers = {
  "@earendil-works/pi-ai": "*",
  "@earendil-works/pi-coding-agent": "*",
  "@earendil-works/pi-tui": "*",
  typebox: "*",
};
const expectedPublishConfig = {
  access: "public",
  registry: "https://registry.npmjs.org/",
};
const allowed = new Set([
  "CHANGELOG.md",
  "LICENSE-APACHE",
  "LICENSE-MIT",
  "NOTICE",
  "README.md",
  "SECURITY.md",
  "dist/index.js",
  "dist/pdf-worker.js",
  "docs/design.md",
  "docs/licenses/MIT-aho-corasick-memchr.txt",
  "docs/licenses/MIT-anstyle-clap-family.txt",
  "docs/licenses/MIT-dtolnay-family.txt",
  "docs/licenses/MIT-heck.txt",
  "docs/licenses/MIT-regex-family.txt",
  "docs/licenses/MIT-strsim.txt",
  "docs/licenses/MIT-utf8parse.txt",
  "docs/licenses/Rust-1.97.1-COPYRIGHT.txt",
  "docs/licenses/Rust-1.97.1-LICENSE-MIT.txt",
  "docs/licenses/Rust-1.97.1-STDLIB-NOTICE.md",
  "docs/licenses/Unicode-3.0.txt",
  "docs/native-dependency-inventory.md",
  "docs/product-flow.md",
  "docs/releasing.md",
  "docs/unpdf-LICENSE-MIT.txt",
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
  const result = spawnSync(
    trustedNpm.nodePath,
    [trustedNpm.npmCliPath, "pack", ...args, "--json", "--ignore-scripts"],
    {
      cwd: root,
      encoding: "utf8",
      env: trustedNpmEnvironment,
      maxBuffer: 512 * 1024,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
      windowsHide: true,
    },
  );
  assert.equal(result.error, undefined, "trusted npm pack must execute");
  assert.equal(result.signal, null, "trusted npm pack must not be signalled");
  assert.equal(result.status, 0, "trusted npm pack must succeed");
  assert.equal(result.stderr, "", "trusted npm pack stderr must be empty");
  const parsed = parseStrictJson(result.stdout, { label: "npm pack output", maximumBytes: 512 * 1024 });
  assert.equal(parsed.length, 1);
  const names = new Set(parsed[0].files.map(({ path: file }) => file));
  assert.deepEqual(names, allowed);
  assert.ok(parsed[0].size < 4_000_000, "packed artifact must remain below 4 MB");
  assert.ok(parsed[0].unpackedSize < 12_500_000, "unpacked artifact must remain below 12.5 MB");
  return parsed[0];
}

try {
  pack(["--dry-run"]);
  const artifact = pack(["--pack-destination", temporaryDirectory]);
  const artifactPath = path.join(temporaryDirectory, artifact.filename);
  assert.ok((await stat(artifactPath)).size > 0);
  const rawTarEntries = execFileSync(trustedTar, ["-tzf", artifactPath], { encoding: "utf8", shell: false })
    .trim()
    .split("\n")
    .filter(Boolean);
  assert.equal(
    rawTarEntries.some((entry) => entry.split("/").includes("node_modules")),
    false,
    "packed artifact must not contain node_modules or Pi package contents",
  );
  const tarEntries = rawTarEntries
    .filter((entry) => !entry.endsWith("/"))
    .map((entry) => entry.replace(/^package\//, ""));
  assert.deepEqual(new Set(tarEntries), allowed);

  const extracted = path.join(temporaryDirectory, "extracted");
  await mkdir(extracted);
  execFileSync(trustedTar, ["-xzf", artifactPath, "-C", extracted], { shell: false });
  const packageRoot = path.join(extracted, "package");
  await assert.rejects(access(path.join(packageRoot, "node_modules")));
  const packagedManifest = parseStrictJson(await readFile(path.join(packageRoot, "package.json"), "utf8"), {
    label: "packed package manifest",
    maximumBytes: 256 * 1024,
  });
  assert.equal(packagedManifest.name, "pi-career");
  assert.equal(packagedManifest.version, "0.1.0");
  assert.equal(packagedManifest.private, false, "package.json must explicitly permit reviewed npm publication");
  assert.deepEqual(packagedManifest.publishConfig, expectedPublishConfig);
  assert.deepEqual(packagedManifest.peerDependencies, expectedExternalPeers);
  assert.equal(packagedManifest.devDependencies?.unpdf, "1.8.0", "bundled PDF extractor must remain pinned");
  assert.equal(packagedManifest.peerDependenciesMeta, undefined);
  assert.equal(packagedManifest.dependencies, undefined);
  assert.equal(packagedManifest.optionalDependencies, undefined);
  assert.equal(packagedManifest.bundleDependencies, undefined);
  assert.equal(packagedManifest.bundledDependencies, undefined);
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
  const [bundle, pdfWorker, unpdfLicense] = await Promise.all([
    readFile(path.join(packageRoot, "dist", "index.js"), "utf8"),
    readFile(path.join(packageRoot, "dist", "pdf-worker.js"), "utf8"),
    readFile(path.join(packageRoot, "docs", "unpdf-LICENSE-MIT.txt")),
  ]);
  assert.equal(unpdfLicense.length, 1_082, "unpdf license size");
  assert.equal(
    createHash("sha256").update(unpdfLicense).digest("hex"),
    "4a57080b8ecdb3a53ec678828121849ce5df877a99b1ad8d50e165d8a2aded1b",
    "unpdf license SHA-256",
  );
  assert.equal(bundle.includes("node_modules"), false, "extension bundle must not contain a package tree path");
  assert.equal(pdfWorker.includes("node_modules"), false, "PDF worker bundle must not contain a package tree path");
  assert.ok(pdfWorker.length > 0 && pdfWorker.length < 2_000_000, "PDF worker bundle must remain bounded");
  for (const peer of Object.keys(expectedExternalPeers)) {
    assert.ok(bundle.includes(`from \"${peer}\"`), `${peer} must remain an external bundle import`);
  }
  assert.equal((await stat(path.join(packageRoot, "runtime", "darwin-arm64", "career"))).mode & 0o777, 0o755);
  assert.equal((await stat(path.join(packageRoot, "runtime", "linux-x64-gnu", "career"))).mode & 0o777, 0o755);
  execFileSync(process.execPath, [path.join(root, "scripts", "check-runtime-artifacts.mjs")], {
    cwd: temporaryDirectory,
    env: { ...process.env, PI_CAREER_PACKAGE_ROOT: packageRoot },
    stdio: ["ignore", "inherit", "inherit"],
  });
  execFileSync(process.execPath, [path.join(root, "scripts", "check-native-license-inventory.mjs")], {
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
  execFileSync(process.execPath, [path.join(root, "scripts", "test-isolated-install.mjs")], {
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
  await assert.rejects(access(path.join(packageRoot, "node_modules")));
  process.stdout.write(
    `Verified package artifact ${artifact.filename} (${artifact.size} bytes compressed, ${artifact.unpackedSize} bytes unpacked)\n`,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
