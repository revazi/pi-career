#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = process.env.PI_CAREER_PACKAGE_ROOT ?? repositoryRoot;
assert.ok(path.isAbsolute(root), "PI_CAREER_PACKAGE_ROOT must be absolute when supplied");

const CORE_COMMIT = "a3cdb4c6d7f966397e93ea4664071975bca7228c";
const CARGO_LOCK_SHA256 = "18d188cfea79128d4024dabe2e21f57e5d2098d32ffac8c4ef01243f49abb609";
const RUST_COMMIT = "8bab26f4f68e0e26f0bb7960be334d5b520ea452";
const RUSTC_VERSION = "rustc 1.97.1 (8bab26f4f 2026-07-14)";
const INVENTORY_SHA256 = "49bef86729402d900ba829e2deb23488b0fd1971b047318f3f4aabb7d44e2fc1";

const LICENSE_FILES = new Map([
  ["MIT-aho-corasick-memchr.txt", [1081, "0f96a83840e146e43c0ec96a22ec1f392e0680e6c1226e6f3ba87e0740af850f"]],
  ["MIT-anstyle-clap-family.txt", [1062, "6efb0476a1cc085077ed49357026d8c173bf33017278ef440f222fb9cbcb66e6"]],
  ["MIT-dtolnay-family.txt", [1023, "23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3"]],
  ["MIT-heck.txt", [1071, "7b63ecd5f1902af1b63729947373683c32745c16a10e8e6292e2e2dcd7e90ae0"]],
  ["MIT-regex-family.txt", [1071, "6485b8ed310d3f0340bf1ad1f47645069ce4069dcc6bb46c7d5c6faf41de1fdb"]],
  ["MIT-strsim.txt", [1166, "1e697ce8d21401fbf1bddd9b5c3fd4c4c79ae1e3bdf51f81761c85e11d5a89cd"]],
  ["MIT-utf8parse.txt", [1052, "e4c9b06fa850cb9b540a5e400e9f6394cf15efcf4098144de477d1d3dae10150"]],
  ["Rust-1.97.1-COPYRIGHT.txt", [1571, "172020dbfd5b53a226dfde77616190a48dcff519b0bc0e6deb91a8450782c4af"]],
  ["Rust-1.97.1-LICENSE-MIT.txt", [1068, "b71bd43a069ca0641a9ecfe585ca7b3c53b5cc1608f8b68321168698e28b5ea1"]],
  ["Rust-1.97.1-STDLIB-NOTICE.md", [1442, "294893c9a5aef6fa5578cc190735e72251268366924d8f1dd8a40ca0e58394df"]],
  ["Unicode-3.0.txt", [1995, "f7db81051789b729fea528a63ec4c938fdcb93d9d61d97dc8cc2e9df6d47f2a1"]],
]);

const EXPECTED_PACKAGES = new Set([
  "aho-corasick@1.1.4",
  "anstream@1.0.0",
  "anstyle@1.0.14",
  "anstyle-parse@1.0.0",
  "anstyle-query@1.1.5",
  "career-cli@0.1.0",
  "career-core@0.1.0",
  "clap@4.6.4",
  "clap_builder@4.6.2",
  "clap_derive@4.6.4",
  "clap_lex@1.1.0",
  "colorchoice@1.0.5",
  "heck@0.5.0",
  "is_terminal_polyfill@1.70.2",
  "itoa@1.0.18",
  "memchr@2.8.3",
  "proc-macro2@1.0.107",
  "quote@1.0.47",
  "regex@1.13.1",
  "regex-automata@0.4.16",
  "regex-syntax@0.8.11",
  "serde@1.0.229",
  "serde_core@1.0.229",
  "serde_derive@1.0.229",
  "serde_json@1.0.151",
  "strsim@0.11.1",
  "syn@3.0.3",
  "unicode-ident@1.0.24",
  "utf8parse@0.2.2",
  "zmij@1.0.23",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exactFile(relativePath, expectedSize, expectedHash) {
  const absolute = path.join(root, relativePath);
  const metadata = await lstat(absolute);
  assert.ok(metadata.isFile(), `${relativePath} must be a regular file`);
  assert.equal(metadata.mode & 0o777, 0o644, `${relativePath} mode`);
  assert.equal(metadata.size, expectedSize, `${relativePath} size`);
  const bytes = await readFile(absolute);
  assert.equal(sha256(bytes), expectedHash, `${relativePath} SHA-256`);
  return bytes.toString("utf8");
}

const licenseDirectory = path.join(root, "docs", "licenses");
const entries = await readdir(licenseDirectory, { withFileTypes: true });
assert.ok(entries.every((entry) => entry.isFile()), "docs/licenses may contain regular files only");
assert.deepEqual(new Set(entries.map(({ name }) => name)), new Set(LICENSE_FILES.keys()));
for (const [name, [size, hash]] of LICENSE_FILES) {
  await exactFile(`docs/licenses/${name}`, size, hash);
}

const inventory = await exactFile(
  "docs/native-dependency-inventory.md",
  12441,
  INVENTORY_SHA256,
);
assert.match(inventory, new RegExp(CORE_COMMIT));
assert.match(inventory, new RegExp(CARGO_LOCK_SHA256));
assert.match(inventory, new RegExp(RUST_COMMIT));
assert.match(inventory, /28 crates\.io packages, two Career Core workspace packages/);
assert.match(inventory, /aarch64-apple-darwin/);
assert.match(inventory, /x86_64-unknown-linux-gnu/);
assert.match(inventory, /libSystem\.B\.dylib/);
assert.match(inventory, /libgcc_s\.so\.1/);
assert.match(inventory, /libc\.so\.6/);
assert.match(inventory, /ld-linux-x86-64\.so\.2/);

const packageRows = new Set();
for (const match of inventory.matchAll(/^\| `([^`]+)` \| `([^`]+)` \| `[^`]+` \|/gm)) {
  packageRows.add(`${match[1]}@${match[2]}`);
}
assert.deepEqual(packageRows, EXPECTED_PACKAGES);

const manifest = JSON.parse(await readFile(path.join(root, "runtime", "manifest.json"), "utf8"));
assert.equal(manifest.career_core.commit, CORE_COMMIT);
assert.deepEqual(Object.keys(manifest.targets).sort(), ["darwin-arm64", "linux-x64-gnu"]);
for (const target of Object.values(manifest.targets)) {
  const provenance = JSON.parse(await readFile(path.join(root, target.provenance_path), "utf8"));
  assert.equal(provenance.build.rustc_version, RUSTC_VERSION);
}

process.stdout.write(
  `Verified native license inventory: ${EXPECTED_PACKAGES.size} Cargo packages, Rust 1.97.1, ${LICENSE_FILES.size} license/notice files\n`,
);
