#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = async (relative) => readFile(path.join(root, relative), "utf8");
const indexSource = await source("src/index.ts");
const processSource = await source("src/process.ts");
const runtimeResolverSource = await source("src/runtime.ts");
const errorSource = await source("src/errors.ts");
const workflowFiles = (await readdir(path.join(root, "src", "workflow")))
  .filter((file) => file.endsWith(".ts"))
  .sort();
const workflowSource = (await Promise.all(workflowFiles.map((file) => source(`src/workflow/${file}`)))).join("\n");
const processBoundarySource = `${processSource}\n${runtimeResolverSource}\n${errorSource}`;
const completeSource = `${indexSource}\n${processBoundarySource}\n${workflowSource}`;
const bundle = await source("dist/index.js");
const packageManifest = JSON.parse(await source("package.json"));

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
assert.doesNotMatch(processBoundarySource, /\bfetch\s*\(|appendEntry|registerProvider|registerCommand|console\./i);
assert.doesNotMatch(processBoundarySource, /process\.env\.PATH|resolveCareerExecutable\([^)]*\)\s*\?\?\s*["']career["']/);
assert.doesNotMatch(processBoundarySource, /spawn\(\s*["']cargo["']|exec(?:File)?\(\s*["']cargo["']/i);

assert.match(indexSource, /registerCareerCommands\(pi\)/);
assert.match(workflowSource, /invokeCareerCli/);
assert.match(workflowSource, /registerCommand\("career-setup"/);
assert.match(workflowSource, /registerCommand\("career-library"/);
assert.match(workflowSource, /registerCommand\("career-vacancy"/);
assert.match(workflowSource, /registerCommand\("career-match"/);
assert.match(workflowSource, /registerCommand\("career-analyze"/);
assert.doesNotMatch(workflowSource, /career_core_(?:discover|resume|job)/);
assert.doesNotMatch(workflowSource, /\bfetch\s*\(|registerProvider|modelRegistry|sendMessage|sendUserMessage|before_provider|console\./i);
assert.doesNotMatch(workflowSource, /node:child_process|\bexec\s*\(|\bexecFile\s*\(|\bspawn\s*\(|\bcargo\b|process\.env\.PATH/i);
assert.doesNotMatch(completeSource, /console\.(?:log|error|warn|debug)/);
assert.doesNotMatch(bundle, /\bfetch\s*\(|registerProvider|modelRegistry|sendUserMessage|before_provider/);
assert.equal(packageManifest.dependencies, undefined);
for (const lifecycle of [
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepack",
  "postpack",
]) assert.equal(packageManifest.scripts?.[lifecycle], undefined);
process.stdout.write("Runtime and deterministic workflow boundary scan passed\n");
