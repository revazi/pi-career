// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractUrl = new URL("../../docs/single-application-state.md", import.meta.url);

function jsonAfter(markdown, anchor) {
  const start = markdown.indexOf(anchor);
  assert.notEqual(start, -1, `missing contract anchor: ${anchor}`);
  const match = markdown.slice(start).match(/```json\n([\s\S]*?)\n```/);
  assert.ok(match, `missing JSON after: ${anchor}`);
  return JSON.parse(match[1]);
}

test("#140 defines one application-state schema with no compatibility path", async () => {
  const markdown = await readFile(contractUrl, "utf8");
  const state = jsonAfter(markdown, "## Canonical schema");

  assert.deepEqual(Object.keys(state), [
    "schema_version", "kind", "application_id", "sequence", "parent_sha256", "status",
    "vacancy", "selected_original", "resume_artifact", "cover_letter_artifact", "updated_at",
  ]);
  assert.equal(state.schema_version, "pi.career.application_state");
  assert.equal(state.kind, "application_state_revision");
  assert.equal(state.cover_letter_artifact, null);

  assert.match(markdown, /There is no application-state schema migration or compatibility path\./);
  assert.match(markdown, /Files whose `schema_version` is `pi\.career\.application_state\.v1`, `pi\.career\.application_state\.v2`, or any other value are unsupported and fail closed\./);
  assert.match(markdown, /There is no transition revision, upgrade, downgrade, dual reader, or mixed-schema chain\./);
  assert.match(markdown, /Revision numbers and parent hashes protect immutable history, concurrency, crash settlement, and no-clobber publication; they are not schema versions\./);
});

test("#57 implements the approved user-authored cover-letter contract on the #140 reference", async () => {
  const markdown = await readFile(contractUrl, "utf8");
  const cover = jsonAfter(markdown, "A non-null cover-letter reference");

  assert.deepEqual(Object.keys(cover), [
    "relative_path", "artifact_sha256", "utf8_bytes", "format", "authority",
    "job_description_sha256", "effective_resume_sha256",
  ]);
  assert.equal(cover.authority, "user_authored");
  assert.match(markdown, /Issue #57 separately authorizes a narrowly scoped user-authored writer/);
  const coverContract = await readFile(new URL("../../docs/cover-letter-contract.md", import.meta.url), "utf8");
  assert.match(coverContract, /authority: "user_authored"/);
  assert.match(coverContract, /state is the commit record/);
  assert.match(coverContract, /Clear appends a state revision with a null reference/);
});

test("#140 assigns focused single-schema acceptance scenarios to #141", async () => {
  const markdown = await readFile(contractUrl, "utf8");
  const rows = markdown.split("\n").filter((line) => /^\| S1-/.test(line));

  assert.equal(rows.length, 12);
  rows.forEach((row, index) => {
    const columns = row.split("|").slice(1, -1).map((column) => column.trim());
    assert.equal(columns.length, 4);
    assert.equal(columns[0], `S1-${String(index + 1).padStart(2, "0")}`);
    for (const column of columns.slice(1)) assert.ok(column.length > 0);
  });
  assert.match(markdown, /Issue #141 implements production, fixture, generated-bundle, and documentation convergence\./);
});

test("#141 maps every S1 scenario to focused behavioral coverage", async () => {
  const evidence = {
    1: ["application-state-reader", "S1-01/S1-02: catalog reads canonical single-schema chains without mutation"],
    2: ["application-state-reader", "S1-01/S1-02: catalog reads canonical single-schema chains without mutation"],
    3: ["application-state-reader", "S1-03/S1-04/S1-05/S1-11: former and invalid schemas fail closed without a trusted current record"],
    4: ["application-state-reader", "S1-03/S1-04/S1-05/S1-11: former and invalid schemas fail closed without a trusted current record"],
    5: ["application-state-reader", "S1-03/S1-04/S1-05/S1-11: former and invalid schemas fail closed without a trusted current record"],
    6: ["persistent-overlay-creation", "S1-06/P3-16 configured-root Applications create commits canonical sequence 1 and renders Preparing Incomplete 0/3"],
    7: ["application-status-authority", "S1-02/S1-07/P3-45 public attached status reads a canonical chain and approved mutation appends exactly one revision"],
    8: ["application-state-reader", "S1-08: sequence 1 accepts the exact nullable cover-letter reference shape"],
    9: ["application-concurrency-acceptance", "S1-09/P3-39 two independently prepared same-next-revision plans commit concurrently without fork"],
    10: ["capacity-boundary-matrix", "S1-10/P3-44 under-lock application-entry and revision crossings do not publish a new head"],
    11: ["application-state-reader", "S1-03/S1-04/S1-05/S1-11: former and invalid schemas fail closed without a trusted current record"],
    12: ["application-state-reader", "S1-12: a single-schema source failure remains mutation-free"],
  };

  assert.equal(Object.keys(evidence).length, 12);
  for (const [number, [name, title]] of Object.entries(evidence)) {
    const source = await readFile(new URL(`./${name}.test.mjs`, import.meta.url), "utf8");
    const titles = [...source.matchAll(/^test\("([^"\n]+)",/gm)].map((match) => match[1]);
    assert.equal(titles.filter((candidate) => candidate === title).length, 1, `S1-${String(number).padStart(2, "0")} needs one exact witness`);
  }
});
