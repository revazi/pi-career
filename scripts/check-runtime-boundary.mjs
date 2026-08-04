#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const processSource = await readFile(path.join(root, "src", "process.ts"), "utf8");
const runtimeSource = `${await readFile(path.join(root, "src", "index.ts"), "utf8")}\n${processSource}`;
const bundle = await readFile(path.join(root, "dist", "index.js"), "utf8");

assert.match(processSource, /spawn\(executable, prepared\.args, \{/);
assert.match(processSource, /shell:\s*false/);
assert.doesNotMatch(processSource, /node:fs|mkdtemp|tmpdir|writeFile|exec\(|execFile\(|spawnSync\(/);
assert.doesNotMatch(runtimeSource, /\bfetch\s*\(|appendEntry|registerProvider|console\./i);
assert.doesNotMatch(processSource, /spawn\(\s*["']cargo["']|exec(?:File)?\(\s*["']cargo["']/i);
assert.doesNotMatch(bundle, /node:fs|mkdtemp|tmpdir|writeFile|\bfetch\s*\(|registerProvider|appendEntry/);
process.stdout.write("Runtime boundary scan passed\n");
