#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".fallow", ".git", "node_modules"]);
const ignoredFiles = new Set(["package-lock.json"]);
const textExtensions = new Set([".js", ".json", ".md", ".mjs", ".ts", ".yml", ".yaml", ""]);
const patterns = [
  new RegExp(["BEGIN ", "PRIVATE KEY"].join("")),
  new RegExp(["AKIA", "[A-Z0-9]{16}"].join("")),
  new RegExp(["ghp_", "[A-Za-z0-9]{30,}"].join("")),
  new RegExp(["sk-ant-", "[A-Za-z0-9_-]{20,}"].join("")),
];

async function files(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await files(absolute)));
    else if (entry.isFile() && !ignoredFiles.has(entry.name) && textExtensions.has(path.extname(entry.name))) found.push(absolute);
  }
  return found;
}

let scanned = 0;
for (const file of await files(root)) {
  const content = await readFile(file, "utf8");
  for (const pattern of patterns) {
    assert.equal(pattern.test(content), false, `possible credential in ${path.relative(root, file)}`);
  }
  scanned += 1;
}
process.stdout.write(`Scanned ${scanned} text files for credential patterns\n`);
