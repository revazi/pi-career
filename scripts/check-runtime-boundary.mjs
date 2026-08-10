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
const managedFiles = (await readdir(path.join(root, "src", "managed")))
  .filter((file) => file.endsWith(".ts"))
  .sort();
const workflowSource = (await Promise.all(workflowFiles.map((file) => source(`src/workflow/${file}`)))).join("\n");
const managedSource = (await Promise.all(managedFiles.map((file) => source(`src/managed/${file}`)))).join("\n");
const deterministicWorkflowSource = (await Promise.all(
  workflowFiles.filter((file) => file !== "workbench.ts").map((file) => source(`src/workflow/${file}`)),
)).join("\n");
const workbenchSource = await source("src/workflow/workbench.ts");
const pdfSource = await source("src/workflow/pdf.ts");
const pdfWorkerSource = await source("src/workflow/pdf-worker.ts");
const processBoundarySource = `${processSource}\n${runtimeResolverSource}\n${errorSource}`;
const completeSource = `${indexSource}\n${processBoundarySource}\n${workflowSource}\n${managedSource}`;
const bundle = await source("dist/index.js");
const pdfWorkerBundle = await source("dist/pdf-worker.js");
const ciWorkflow = await source(".github/workflows/ci.yml");
const externalCareerWorkflow = await source(".github/workflows/external-career.yml");
const packageManifest = JSON.parse(await source("package.json"));

assert.match(processSource, /spawn\(runtime\.command, \[\.\.\.runtime\.argumentPrefix, \.\.\.prepared\.args\], \{/);
assert.match(processSource, /shell:\s*false/);
assert.match(processSource, /resolveCareerRuntime/);
assert.match(runtimeResolverSource, /@revazi\/career/);
assert.match(runtimeResolverSource, /CAREER_PACKAGE_VERSION = "0\.1\.1"/);
assert.match(runtimeResolverSource, /\["path", "package-local", "acquired"\]/);
assert.match(runtimeResolverSource, /PI_OFFLINE/);
assert.match(runtimeResolverSource, /process\.execPath/);
assert.match(runtimeResolverSource, /npm-cli\.js/);
assert.match(runtimeResolverSource, /npm_execpath/);
assert.match(runtimeResolverSource, /--ignore-scripts/);
assert.match(runtimeResolverSource, /--registry=/);
assert.match(runtimeResolverSource, /LOCATE_ACQUIRED_PATH_EXPRESSION = "process\.env\.PATH"/);
assert.match(runtimeResolverSource, /process\.kill\(-child\.pid/);
assert.match(runtimeResolverSource, /process\.kill\(child\.pid, "SIGBREAK"\)/);
assert.match(runtimeResolverSource, /detached:\s*true/);
assert.match(runtimeResolverSource, /lstat/);
assert.match(runtimeResolverSource, /readFile/);
assert.match(runtimeResolverSource, /PATH/);
assert.match(runtimeResolverSource, /CAREER_CLI_PATH/);
assert.doesNotMatch(processSource, /node:fs|mkdtemp|tmpdir|writeFile|exec\(|execFile\(|spawnSync\(/);
assert.doesNotMatch(runtimeResolverSource, /writeFile|appendFile|createWriteStream|mkdir|mkdtemp|tmpdir|\bfetch\s*\(/);
assert.doesNotMatch(processBoundarySource, /appendEntry|registerProvider|registerCommand|console\./i);
assert.doesNotMatch(processBoundarySource, /spawn\(\s*["'](?:cargo|npm|npx)["']|exec(?:File)?\(\s*["'](?:cargo|npm|npx)["']/i);

assert.match(ciWorkflow, /name: Adapter checks/);
assert.doesNotMatch(ciWorkflow, /test:career-package|External Career package/);
assert.match(externalCareerWorkflow, /on:\n  workflow_dispatch:/);
assert.doesNotMatch(externalCareerWorkflow, /pull_request:|branches: \[main\]/);
for (const target of [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64-gnu",
  "linux-arm64-gnu",
  "linux-x64-musl",
  "linux-arm64-musl",
  "win32-x64-msvc",
  "win32-arm64-msvc",
]) assert.match(externalCareerWorkflow, new RegExp(`runtime_target: ${target}`));

assert.match(indexSource, /registerCareerCommands\(pi\)/);
assert.match(indexSource, /registerCareerRun\(pi\)/);
assert.match(workflowSource, /invokeCareerCli/);
assert.match(workflowSource, /registerCommand\("career-setup"/);
assert.match(workflowSource, /registerCommand\("career-library"/);
assert.match(workflowSource, /registerCommand\("career-application"/);
assert.match(workflowSource, /registerCommand\("career-vacancy"/);
assert.match(workflowSource, /registerCommand\("career-match"/);
assert.match(workflowSource, /registerCommand\("career-analyze"/);
assert.match(workflowSource, /registerCommand\("career-workbench"/);
assert.doesNotMatch(deterministicWorkflowSource, /career_core_(?:discover|resume|job)/);
assert.match(workbenchSource, /do not call raw schema tools unless I explicitly request advanced debugging/);
assert.match(workbenchSource, /Use only career_run for normal analysis, matching, proposal review, materialization, and detail hydration/);
assert.doesNotMatch(workflowSource, /\bfetch\s*\(|registerProvider|modelRegistry|sendMessage|sendUserMessage|before_provider|console\./i);
assert.doesNotMatch(workflowSource, /node:child_process|\bexec\s*\(|\bexecFile\s*\(|\bspawn\s*\(|\bcargo\b|process\.env\.PATH/i);
assert.doesNotMatch(managedSource, /node:child_process|node:fs|node:http|node:https|\bfetch\s*\(|registerProvider|modelRegistry|sendMessage|sendUserMessage|before_provider|console\.|process\.env\.PATH/i);
assert.doesNotMatch(managedSource, /writeFile|appendFile|createWriteStream|mkdir|mkdtemp|tmpdir/);
assert.match(pdfSource, /new Worker\(workerUrl\(\)/);
assert.match(pdfSource, /env:\s*\{\}/);
assert.match(pdfWorkerSource, /Object\.defineProperty\(globalThis, "fetch", \{ value: undefined/);
assert.match(pdfWorkerSource, /isEvalSupported:\s*false/);
assert.match(pdfWorkerSource, /useWasm:\s*false/);
assert.match(pdfWorkerSource, /disableAutoFetch:\s*true/);
assert.doesNotMatch(pdfWorkerSource, /node:(?:http|https|net|tls)|XMLHttpRequest|\bfetch\s*\(/);
assert.doesNotMatch(pdfWorkerBundle, /from["']unpdf|node_modules/);
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
