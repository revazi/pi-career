#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildBundle, repositoryRoot } from "./build.mjs";

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "pi-career-dist-"));
try {
  const first = path.join(temporaryDirectory, "first.js");
  const second = path.join(temporaryDirectory, "second.js");
  await buildBundle(first);
  await buildBundle(second);

  const [firstBytes, secondBytes, trackedBytes] = await Promise.all([
    readFile(first),
    readFile(second),
    readFile(path.join(repositoryRoot, "dist", "index.js")),
  ]);
  assert.deepEqual(firstBytes, secondBytes, "two clean builds must be byte-equivalent");
  assert.deepEqual(trackedBytes, firstBytes, "dist/index.js is stale; run npm run build");
  assert.ok(trackedBytes.length > 0 && trackedBytes.length < 100_000, "runtime bundle must remain small and non-empty");
  process.stdout.write(`Reproducible dist/index.js (${trackedBytes.length} bytes)\n`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
