// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Specification bookkeeping only: passing this test does not demonstrate that
// any proposed persistence behavior is implemented. Integration tests own that.
test("persistence acceptance ledger preserves all 48 scenarios and explicit owners", async () => {
  const markdown = await readFile(new URL("../../docs/persistence-acceptance.md", import.meta.url), "utf8");
  const rows = markdown.split("\n").filter((line) => /^\| P3-/.test(line));
  assert.equal(rows.length, 48, "every approved scenario must remain accounted for");
  rows.forEach((row, index) => {
    const columns = row.split("|").slice(1, -1).map((column) => column.trim());
    assert.equal(columns.length, 5, `scenario row ${index + 1} needs ID/Given/When/Then/Owner`);
    assert.equal(columns[0], `P3-${String(index + 1).padStart(2, "0")}`);
    for (const column of columns.slice(1, 4)) assert.ok(column.length > 0);
    assert.match(columns[4], /^#\d+(?:\/#\d+)*$/, "each scenario needs explicit issue ownership");
  });
});
