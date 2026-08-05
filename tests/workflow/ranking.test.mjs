// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { rankMatches } from "../../src/workflow/result-projection.ts";
import { matchResult } from "./helpers.mjs";

function resume(id, file) {
  return {
    id: id.repeat(64), root_id: "f".repeat(64), path: `/synthetic/${file}`, relative_path: file,
    label: file, kind: "original", format: "markdown", modified_at: "2026-08-04T17:56:06.000Z",
    size_bytes: 9, text: "Synthetic", text_sha256: "e".repeat(64),
  };
}

test("ranking is score, recommendation bucket, canonical path, then id", () => {
  const ranked = rankMatches([
    { resume: resume("c", "c.md"), result: matchResult(80, "improve_first") },
    { resume: resume("b", "b.md"), result: matchResult(80, "apply_now") },
    { resume: resume("a", "a.md"), result: matchResult(83, "improve_first") },
    { resume: resume("d", "d.md"), result: matchResult(79, "apply_now") },
  ]);
  assert.deepEqual(ranked.map((item) => item.resume.relative_path), ["a.md", "b.md", "c.md", "d.md"]);
  assert.equal(ranked[0].closeCluster, true);
  assert.equal(ranked[1].closeCluster, true);
  assert.equal(ranked[2].closeCluster, false);
  assert.equal(ranked[0].projection.ui_flags.close_cluster, true);
});

test("identical published top scores receive a tie label without changing sort", () => {
  const ranked = rankMatches([
    { resume: resume("b", "b.md"), result: matchResult(90, "apply_now") },
    { resume: resume("a", "a.md"), result: matchResult(90, "apply_now") },
  ]);
  assert.deepEqual(ranked.map((item) => item.resume.relative_path), ["a.md", "b.md"]);
  assert.ok(ranked.every((item) => item.tie && item.closeCluster));
});
