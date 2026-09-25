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
  5: ["unknown-child-attachment-boundary", "P3-05 registered configure-root and Applications discovery/attach leave an unknown direct child aggregate drifted and non-attachable"],
  6: ["overlay-exact-label-restart", "P3-06/P3-07 registered Applications restart-like reconstruction lists and opens exact identity labels without slug or Unicode conflation"],
  7: ["overlay-exact-label-restart", "P3-06/P3-07 registered Applications restart-like reconstruction lists and opens exact identity labels without slug or Unicode conflation"],
  8: ["application-status-authority", "P3-08/P3-09/P3-45 public attached status reads a complete v1 chain and approved mutation appends the exact v2 transition"],
  9: ["application-status-authority", "P3-08/P3-09/P3-45 public attached status reads a complete v1 chain and approved mutation appends the exact v2 transition"],
  10: ["application-state-v2-reader", "P3-04/P3-10: complete-chain validation rejects downgrade, gap, mismatch, fork, and future schema"],
  11: ["legacy-overlay-migration-acceptance", "P3-11/P3-14 legacy Applications browse and open are read-only without session identity"],
  12: ["legacy-overlay-migration-acceptance", "P3-12 legacy Applications migration cancellation and post-preview byte race create nothing"],
  13: ["legacy-overlay-migration-acceptance", "P3-13/P3-14/P3-47 registered legacy migration writes only canonical identity and preserves v1 bytes"],
  14: ["legacy-overlay-migration-acceptance", "P3-13/P3-14/P3-47 registered legacy migration writes only canonical identity and preserves v1 bytes"],
  15: ["legacy-overlay-migration-acceptance", "P3-15 independently prepared legacy migration plans have one no-clobber winner"],
  16: ["persistent-overlay-creation", "P3-16 configured-root Applications create resolves consent before exact preview, commits one canonical package, and renders Preparing Incomplete 0/3 after restart-like reconstruction"],
  17: ["application-readiness", "P3-16 through P3-25: pure readiness implements every reachable availability row"],
  18: ["application-readiness", "P3-16 through P3-25: pure readiness implements every reachable availability row"],
  19: ["application-readiness", "P3-16 through P3-25: pure readiness implements every reachable availability row"],
  20: ["application-readiness-integration", "P3-20/P3-21/P3-24: validated transitions stale a bound letter and lifecycle never bypasses completeness"],
  21: ["application-readiness-integration", "P3-20/P3-21/P3-24: validated transitions stale a bound letter and lifecycle never bypasses completeness"],
  22: ["command-authority", "P3-22 public attached-source validation blocks missing or changed selected original without choosing another eligible original"],
  23: ["command-authority", "P3-23 public attached-source validation rejects a valid tailored artifact bound to another original without fallback"],
  24: ["application-readiness-integration", "P3-20/P3-21/P3-24: validated transitions stale a bound letter and lifecycle never bypasses completeness"],
  25: ["application-readiness", "P3-16 through P3-25: pure readiness implements every reachable availability row"],
  26: ["overlay", "P3-26/P3-27/P3-34 unattached browse and open retain authority and hide private list bytes"],
  27: ["overlay", "P3-26/P3-27/P3-34 unattached browse and open retain authority and hide private list bytes"],
  28: ["session-attachment-commands", "P3-27/P3-28 attach appends only the identity pointer after confirmation"],
  29: ["session-catalog-attach", "P3-29/P3-54 public attach rejects another UUID on active and replayed non-active branches and offers explicit replacement"],
  31: ["session-attachment-validation", "P3-31 missing configuration or a legacy identity is unavailable"],
  34: ["overlay", "P3-26/P3-27/P3-34 unattached browse and open retain authority and hide private list bytes"],
  35: ["document-preview", "P3-35 local RPC preview needs separate explicit action; back and cancel discard bytes without mutation"],
  38: ["application-concurrency-acceptance", "P3-38 two same-UUID creators commit concurrently with one exact no-retry winner"],
  39: ["application-concurrency-acceptance", "P3-39 two independently prepared same-next-revision plans commit concurrently without fork"],
  40: ["application-artifact-reconciliation-acceptance", "P3-40 artifact-published state-absent fault leaves a non-authoritative orphan and registered reconciliation never adopts it"],
  41: ["application-concurrency-acceptance", "P3-41 exact durably published state settles success and equivalent retry is idempotent"],
  42: ["application-concurrency-acceptance", "P3-42 crash-left canonical lock blocks one public mutation attempt without replacement"],
  43: ["application-concurrency-acceptance", "P3-43 post-preview referenced-byte drift blocks commit without blessing or side effects"],
  45: ["application-status-authority", "P3-08/P3-09/P3-45 public attached status reads a complete v1 chain and approved mutation appends the exact v2 transition"],
  46: ["overlay", "P3-46 one Applications view distinguishes a session-only application from persistent records without changing authority"],
  47: ["legacy-overlay-migration-acceptance", "P3-13/P3-14/P3-47 registered legacy migration writes only canonical identity and preserves v1 bytes"],
  48: ["command-authority", "P3-48 linked assisted artifact stays out of Analyze/Match original authority while attached Match uses effective Resume"],
  51: ["session-attachment-commands", "P3-51 activation prepares a document-free handoff and does not submit"],
  52: ["lifecycle-restore-acceptance", "P3-52 fresh installed extension resumes exact persisted activation with compact managed surface"],
  54: ["session-catalog-attach", "P3-29/P3-54 public attach rejects another UUID on active and replayed non-active branches and offers explicit replacement"],
  55: ["session-catalog-attach", "P3-55 an activated session opens a replacement with attachment only and no conversation"],
  56: ["lifecycle-restore-acceptance", "P3-56 installed invalid restore/action matrix fails closed without append or mutation"],
};

const deferred = {
  50: "Inactive surface projection without activation does not inspect an ordinary model turn for Skill content and tool schemas.",
  53: "Installed session_tree receives ExtensionContext and has no reload(); reload() exists only on ExtensionCommandContext. Host resources_discover runs on startup/reload, not after tree navigation, so Skill reload cannot be requested from that event without inventing a command-context seam.",
  30: "Detach/reload is not process shutdown; transient attachment loss and intact workspace bytes need a shutdown test.",
  32: "Local browse/mutation paths need provider/model boundary spies.",
  33: "Pure projection privacy does not establish absence of persisted sentinels across all actions.",
  36: "Installed-extension and workflow session_start/session_tree plus /career print/JSON traps cover session getters and registration-scoped loader, UI, append, send and Core boundaries. Direct filesystem reads, host lifecycle ordering, and future read routes lack independent interception.",
  37: "Scoped session/UI/forged-error and Core-invoke sentinels plus public raw-tool normalization do not cover Core resolver, all source/catalog errors or persisted bytes across actions; these paths have no logger boundary to spy without inventing telemetry.",
  44: "Existing read bounds do not provide deterministic below/at/above plan and under-lock race evidence for every independent root-entry, application-entry, revision, managed-byte, preview-byte, metadata, document, label, and config capacity.",
  49: "Inactive model surface does not prove all five forbidden effects during browse/filter.",
  57: "Inactive raw-tool rejection and active-tool lists do not observe model context: all four schemas may still be registered.",
  58: "Transient replay does not prove reload and process-shutdown handle loss.",
};

test("#60 evidence map assigns every P3 row exactly one behavioral witness or owned deferral", async () => {
  const markdown = await readFile(contractUrl, "utf8");
  assert.equal(Object.keys(behavioral).length, 47, "reviewed map has exactly 47 scoped witnesses");
  assert.equal(Object.keys(deferred).length, 11, "reviewed map retains exactly 11 deferrals");
  assert.match(markdown, /Currently 47 have scoped witnesses and 11 remain deferred\./);
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
