#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexSource = await readFile(path.join(root, "src", "index.ts"), "utf8");
const processSource = await readFile(path.join(root, "src", "process.ts"), "utf8");
const runtimeResolverSource = await readFile(path.join(root, "src", "runtime.ts"), "utf8");
const errorSource = await readFile(path.join(root, "src", "errors.ts"), "utf8");
const runtimeSource = `${indexSource}\n${processSource}\n${runtimeResolverSource}\n${errorSource}`;
const bundle = await readFile(path.join(root, "dist", "index.js"), "utf8");
const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

assert.match(processSource, /spawn\(executable, prepared\.args, \{/);
assert.match(processSource, /shell:\s*false/);
assert.match(processSource, /resolveBundledRuntime\(\)/);
assert.match(runtimeResolverSource, /"darwin-arm64"/);
assert.match(runtimeResolverSource, /"linux-x64-gnu"/);
assert.match(runtimeResolverSource, /glibcVersionRuntime/);
assert.match(runtimeResolverSource, /createHash\("sha256"\)/);
assert.match(runtimeResolverSource, /lstat/);
assert.match(runtimeResolverSource, /readFile/);
assert.match(processSource, /CAREER_CLI_PATH/);
assert.doesNotMatch(processSource, /node:fs|mkdtemp|tmpdir|writeFile|exec\(|execFile\(|spawnSync\(/);
assert.doesNotMatch(runtimeResolverSource, /writeFile|appendFile|createWriteStream|mkdir|mkdtemp|tmpdir/);
assert.doesNotMatch(runtimeSource, /\bfetch\s*\(|appendEntry|registerProvider|registerCommand|console\./i);
assert.doesNotMatch(runtimeSource, /process\.env\.PATH|resolveCareerExecutable\([^)]*\)\s*\?\?\s*["']career["']/);
assert.doesNotMatch(runtimeSource, /spawn\(\s*["']cargo["']|exec(?:File)?\(\s*["']cargo["']/i);
assert.doesNotMatch(bundle, /writeFile|appendFile|createWriteStream|mkdtemp|tmpdir|\bfetch\s*\(|registerProvider|appendEntry|registerCommand/);
assert.equal(packageManifest.dependencies, undefined);
for (const lifecycle of [
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepack",
  "postpack",
]) assert.equal(packageManifest.scripts?.[lifecycle], undefined);
process.stdout.write("Runtime boundary scan passed\n");
