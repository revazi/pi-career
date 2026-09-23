// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Specification bookkeeping only: passing this test does not demonstrate that
// any proposed persistence behavior is implemented. Integration tests own that.
const contractUrl = new URL("../../docs/persistence-acceptance.md", import.meta.url);

test("persistence acceptance ledger preserves all 58 scenarios and explicit owners", async () => {
  const markdown = await readFile(contractUrl, "utf8");
  const rows = markdown.split("\n").filter((line) => /^\| P3-/.test(line));
  assert.equal(rows.length, 58, "every approved scenario must remain accounted for");
  rows.forEach((row, index) => {
    const columns = row.split("|").slice(1, -1).map((column) => column.trim());
    assert.equal(columns.length, 5, `scenario row ${index + 1} needs ID/Given/When/Then/Owner`);
    assert.equal(columns[0], `P3-${String(index + 1).padStart(2, "0")}`);
    for (const column of columns.slice(1, 4)) assert.ok(column.length > 0);
    assert.match(columns[4], /^#\d+(?:\/#\d+)*$/, "each scenario needs explicit issue ownership");
  });
});

// An evidence pointer is a behavioral test title, not a fixture assertion. Keep
// deferred reasons explicit: finding a public API later does not silently promote
// a scenario to passing acceptance coverage.
const behavioral = {
  1: ["application-catalog", "catalog reads an empty marked root without creating an index"],
  2: ["application-catalog", "catalog sorts valid and legacy applications and marks slug presentation non-authoritative"],
  3: ["application-catalog", "catalog classifies a mixed root exactly once per child without exposing invalid details"],
  4: ["persistence-acceptance-behavior", "P3-04 corrupt manifest identity and chain are never exposed as valid"],
  10: ["application-state-v2-reader", "P3-04/P3-10: complete-chain validation rejects downgrade, gap, mismatch, fork, and future schema"],
  17: ["application-readiness", "P3-16 through P3-25: pure readiness implements every reachable availability row"],
  18: ["application-readiness", "P3-16 through P3-25: pure readiness implements every reachable availability row"],
  19: ["application-readiness", "P3-16 through P3-25: pure readiness implements every reachable availability row"],
  25: ["application-readiness", "P3-16 through P3-25: pure readiness implements every reachable availability row"],
  28: ["session-attachment-commands", "P3-27/P3-28 attach appends only the identity pointer after confirmation"],
  31: ["session-attachment-validation", "P3-31 missing configuration or a legacy identity is unavailable"],
  45: ["application-status-authority", "P3-45 attached application status is workspace-only and cancelled updates change neither authority"],
  51: ["session-attachment-commands", "P3-51 activation prepares a document-free handoff and does not submit"],
  55: ["session-catalog-attach", "P3-29/P3-55 a used session opens another application only in a replacement session"],
};

const deferred = {
  8: "Catalog acceptance of an all-v1 chain preserves bytes but does not return the legacy state to a caller.",
  22: "Pure readiness verifies an eligible scan record but does not block binding an assisted variant in a workflow action.",
  29: "Opening another application in a replacement session does not test rejection of attach on a used session or its fresh-session offer.",
  50: "Inactive surface projection without activation does not inspect an ordinary model turn for Skill content and tool schemas.",
  53: "Detach and reload do not establish navigate-before-activation behavior or absence of provider/Core calls and handles.",
  54: "Invalid replay for a second claim does not demonstrate attach-command rejection and an explicit replacement-session offer on every branch.",
  5: "Unknown-child catalog classification does not establish configure-root attachment restrictions.",
  20: "Changing the job description of a ready bound application is not tested by a synthetic digest mismatch in pure derivation.",
  23: "Drifted artifact evidence does not establish rejection of a valid artifact bound to a different original.",
  52: "An activated in-memory session is not a restarted saved activation with revalidated exact pointer.",
  56: "Pointer validation failures alone do not establish that invalid transitions append and mutate nothing.",
  57: "Inactive initial model surface does not test a raw tool request being rejected without exposing four schemas.",
  6: "Restart and exact label restoration across the overlay are not covered by catalog-only tests.",
  21: "Artifact absence without a selected original does not test a bound cover letter becoming stale after changing the effective resume.",
  7: "Unicode-equivalent distinct labels across restart and listing need an overlay integration test.",
  9: "Reading a v1-to-v2 chain does not test an approved append transition.",
  11: "Opening a legacy application through the overlay needs a no-write integration test.",
  12: "Migration preview cancellation and changed-byte race need a workflow test.",
  13: "Migration confirmation needs a no-clobber identity and byte-preservation test.",
  14: "Legacy overlay and migration without matching session need end-to-end evidence.",
  15: "Concurrent migration plans need a fault-injected no-clobber test.",
  16: "Pure 0/3 derivation does not test creation or absence of automatic attachment.",
  24: "Pure readiness omits lifecycle; applied/closed incomplete state needs a validated state-to-readiness integration test.",
  26: "Catalog read alone does not exercise unattached overlay browsing.",
  30: "Detach/reload is not process shutdown; transient attachment loss and intact workspace bytes need a shutdown test.",
  27: "An unattached overlay highlight/open needs session append and authority spies.",
  32: "Local browse/mutation paths need provider/model boundary spies.",
  33: "Pure projection privacy does not establish absence of persisted sentinels across all actions.",
  34: "Catalog projection alone does not prove rendered list path/body privacy.",
  35: "Authorized bounded local detail/preview requires a dedicated UI integration test.",
  36: "Print/JSON mode needs an early-failure test spying on all private reads.",
  37: "Adapter errors need injected sentinel failures and logging spies.",
  38: "Two concurrent creators need a deterministic no-clobber race test.",
  39: "Two concurrent revision plans need a deterministic no-fork race test.",
  40: "An orphan fixture is not a reconciliation/fault-settlement test.",
  41: "Exact committed-state settlement after ambiguous failure needs a fault-injected test.",
  42: "Crash-left lock needs an attempted mutation with no polling/removal assertion.",
  43: "Catalog drift detection alone does not test a mutation against edited referenced bytes.",
  44: "Read-time state/cover bounds alone do not cover each plan/commit bound or preview race.",
  46: "Session-only Not persisted overlay distinction needs a rendered UI test.",
  47: "Read-time v1 byte preservation is not a migration commit test.",
  48: "Ineligible assisted scan evidence does not test Analyze/Match original selection.",
  49: "Inactive model surface does not prove all five forbidden effects during browse/filter.",
  58: "Transient replay does not prove reload and process-shutdown handle loss.",
};

test("#60 evidence map assigns every P3 row exactly one behavioral witness or owned deferral", async () => {
  const markdown = await readFile(contractUrl, "utf8");
  const rows = markdown.split("\n").filter((line) => /^\| P3-/.test(line));
  assert.equal(rows.length, 58);
  for (const [index, row] of rows.entries()) {
    const number = index + 1;
    const id = `P3-${String(number).padStart(2, "0")}`;
    const witness = behavioral[number];
    const reason = deferred[number];
    assert.equal(Number(Boolean(witness)) + Number(Boolean(reason)), 1, `${id} needs exactly one disposition`);
    const owner = row.split("|").at(-2).trim();
    assert.match(owner, /^#\d+(?:\/#\d+)*$/, `${id} needs an owning issue`);
    if (reason) {
      assert.ok(reason.length >= 40, `${id} needs substantive deferred rationale (${owner})`);
      continue;
    }
    const [name, title] = witness;
    const source = await readFile(new URL(`./${name}.test.mjs`, import.meta.url), "utf8");
    // Require the whole literal test title, not a substring of a misleading
    // title or a fixture-only assertion. The assertion body still needs review.
    assert.ok(!name.includes("fixture") && name !== "persistence-acceptance");
    const titles = [...source.matchAll(/^test\("([^"\n]+)",/gm)].map((match) => match[1]);
    assert.equal(titles.filter((candidate) => candidate === title).length, 1,
      `${id} witness must point to one exact behavioral test title`);
  }
  assert.equal(Object.keys(behavioral).length + Object.keys(deferred).length, 58);
});

// Contract bookkeeping only: this fixes the reviewed byte shape and fixture map
// without claiming that v2 parsing or readiness derivation is implemented.
test("state-v2 contract fixes canonical field order and #60 fixture ownership", async () => {
  const markdown = await readFile(contractUrl, "utf8");
  const match = markdown.match(/The canonical value is:\n\n```json\n([\s\S]*?)\n```/);
  assert.ok(match, "state-v2 canonical JSON example must remain present");
  const state = JSON.parse(match[1]);
  assert.deepEqual(Object.keys(state), [
    "schema_version", "kind", "application_id", "sequence", "parent_sha256", "status",
    "vacancy", "selected_original", "resume_artifact", "cover_letter_artifact", "updated_at",
  ]);
  assert.equal(state.schema_version, "pi.career.application_state.v2");
  assert.deepEqual(Object.keys(state.cover_letter_artifact), [
    "relative_path", "artifact_sha256", "utf8_bytes", "format", "authority",
    "job_description_sha256", "effective_resume_sha256",
  ]);
  assert.equal(state.cover_letter_artifact.authority, "user_authored");

  for (const classification of ["Missing", "Available", "Stale", "Unavailable", "Drifted"]) {
    assert.match(markdown, new RegExp(`\\b${classification}\\b`));
  }
  for (const family of [
    "state-v2-canonical", "mixed-chain", "historical-references", "cover-letter-reference",
    "package-completeness", "source-authority", "read-races-and-privacy", "transaction-orphans",
  ]) assert.ok(markdown.includes(`| \`${family}\` |`));
  assert.equal(markdown.split("\n").filter((line) => /^\| (?:yes|no) \| (?:yes|no) \| (?:yes|no) \|/.test(line)).length, 8);
});

test("#64 contract fixes exact attachment, detachment, activation, and Pi lifecycle", async () => {
  const workspaceContract = await readFile(
    new URL("../../docs/application-workspaces.md", import.meta.url),
    "utf8",
  );
  const jsonAfter = (anchor) => {
    const start = workspaceContract.indexOf(anchor);
    assert.notEqual(start, -1, `missing contract anchor: ${anchor}`);
    const match = workspaceContract.slice(start).match(/```json\n([\s\S]*?)\n```/);
    assert.ok(match, `missing JSON after: ${anchor}`);
    return JSON.parse(match[1]);
  };

  const attachment = jsonAfter("An attach entry has exactly this ordered data object:");
  assert.deepEqual(Object.keys(attachment), [
    "schema_version", "kind", "attachment_id", "application_id", "root_id",
    "root_created_at", "application_created_at", "workspace_created_at",
  ]);
  assert.equal(attachment.schema_version, "pi.career.application_attachment.v1");
  assert.equal(attachment.kind, "application_attachment");

  const detachment = jsonAfter("A detach entry uses the same custom type and exactly this ordered data object:");
  assert.deepEqual(Object.keys(detachment), [
    "schema_version", "kind", "detachment_id", "attachment_id",
  ]);
  assert.equal(detachment.schema_version, "pi.career.application_attachment.v1");
  assert.equal(detachment.kind, "application_detachment");

  const activation = jsonAfter("The custom type for explicit activation is exactly");
  assert.deepEqual(Object.keys(activation), [
    "schema_version", "kind", "activation_id", "attachment_id", "application_id",
  ]);
  assert.equal(activation.schema_version, "pi.career.application_assistance.v1");
  assert.equal(activation.kind, "application_assistance_activation");

  for (const required of [
    "SessionManager.getEntries()", "SessionManager.getBranch()", "session_start",
    "resources_discover", "ctx.reload(); return;", "ctx.newSession({ parentSession, setup, withSession })",
    "`input` handler", "returns `handled`", "sendMessage()", "sendUserMessage()", "pi --no-session",
  ]) assert.ok(workspaceContract.includes(required), `missing Pi lifecycle boundary: ${required}`);
  assert.match(workspaceContract, /no Career Skill path/);
  assert.match(workspaceContract, /ordinary model turns contain neither Career Skill metadata\/content nor a Career tool schema/);
});
