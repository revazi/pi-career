# Persistence acceptance preparation — issue #60

Status: **approved scenario contract with partial executable coverage; no new persistence approval**. The machine-checked disposition in `tests/workflow/persistence-acceptance.test.mjs` identifies behavioral witnesses and explicit deferred rationales. `tests/workflow/persistence-acceptance-behavior.test.mjs` exercises additional catalog boundaries using independent canonical synthetic bytes; these narrower reads do not satisfy the deferred overlay, mutation, or process-shutdown scenarios. Passing that bookkeeping test alone is not behavioral evidence.

Approved product specifications: [#51](https://github.com/revazi/pi-career/issues/51), [#52](https://github.com/revazi/pi-career/issues/52), [#53](https://github.com/revazi/pi-career/issues/53).
Work item: [#60](https://github.com/revazi/pi-career/issues/60).

This document separates approved outcomes from unresolved implementation contracts. It does not supersede the current [workspace protocol](application-workspaces.md) or authorize new persistence. Scenario outcomes originate from Spec 3; test integration is informed by the existing harness afterward.

## Acceptance harness

Use the existing `node:test` + `node:assert/strict` harness, synthetic private temporary directories, and fake Pi contexts. Existing integration examples are in `tests/workflow/application-workspace.test.mjs` and `tests/workflow/helpers.mjs`. No new runtime/test framework dependency is needed.

Every acceptance test must:

- exercise a public workflow boundary or a future explicitly designed read-only catalog/derivation boundary;
- assert observed records, bytes, authority, and side effects, not just a success boolean;
- snapshot original/config/workspace bytes and entry sets before an action;
- inject Core calls and session writes where supported, and add scoped instrumentation for forbidden boundaries not currently injectable;
- assert fixed public error codes and absence of synthetic private sentinels in errors/logs;
- clean only its own synthetic temporary directory;
- identify its `P3-NN` scenario and owning issue.

A missing API or undecided schema is **blocked**, not a passing test. Do not add empty tests or mark all scenarios passing through fixture-only assertions. Fixture validators are not substitutes for behavioral integration tests.

## Scenario ledger

The Given/When/Then rows below preserve Spec 3 numbering. These are specifications, not test results.

| ID | Given | When | Then | Owner |
|---|---|---|---|---|
| P3-01 | Valid private root with no applications | List applications | Return empty list; create no index or file | #61 |
| P3-02 | Valid applications with equal and unequal update times | List applications | Order descending by head time, then ascending UUID for ties | #61 |
| P3-03 | Two directories claim one application UUID | Discover applications | Report identity conflict; neither is silently selected | #61 |
| P3-04 | Corrupt manifest, identity, or chain | Discover applications | Never expose the corrupt record as valid | #61/#62 |
| P3-05 | Unknown direct child beneath root | Discover/configure root | Do not adopt it; preserve existing attachment restrictions | #61 |
| P3-06 | Valid exact identity labels | Restart and list | Restore exact labels from identity, not slugs | #61 |
| P3-07 | Unicode-equivalent, byte-different labels on distinct UUIDs | Validate and list | Apply explicit label rules without conflating identities | #61 |
| P3-08 | Complete valid v1 chain | Read application | Return legacy state without changing bytes | #62 |
| P3-09 | Valid v1 head | Append approved v2 transition | Preserve contiguous sequence and exact parent hash | #62 |
| P3-10 | v2 revision followed by v1 | Read chain | Reject downgrade; do not trust a partial head | #62 |
| P3-11 | Legacy application | Open/list through future overlay | Create no identity or state file | #63/#55 |
| P3-12 | Prepared migration | Cancel or change one preview byte | No mutation or reuse of approval | #63 |
| P3-13 | Valid matching session identity | Confirm migration | Create exact identity once; preserve existing bytes | #63 |
| P3-14 | Legacy application without matching session | Open or request migration | Read-only legacy display; never promote slugs to exact identity | #63 |
| P3-15 | Two migration plans for one identity | Commit concurrently | One no-clobber winner; loser cannot merge or overwrite | #63 |
| P3-16 | Configured root and approved company/role | Create application | Preparing, Incomplete 0/3; no automatic attachment | #55 |
| P3-17 | Valid current job description only | Derive readiness | Incomplete 1/3 | #62 |
| P3-18 | Valid job description and effective resume only | Derive readiness | Incomplete 2/3 | #62 |
| P3-19 | All three current valid components, no blockers | Derive readiness | Ready 3/3 | #62 |
| P3-20 | Ready application with bound cover letter | Change job description | Letter becomes stale; Ready removed | #62/#56 |
| P3-21 | Ready application with bound cover letter | Change effective resume | Letter becomes stale; Ready removed | #62/#56 |
| P3-22 | Selected original missing or changed | Validate effective resume | Block binding; never silently select another original | #62 |
| P3-23 | Tailored artifact bound to another original | Derive effective resume | Reject mismatched artifact; no silent fallback | #62 |
| P3-24 | Applied or Closed application missing components | Derive readiness | Lifecycle does not bypass completeness checks | #62 |
| P3-25 | Valid complete package without match result | Derive readiness | Ready; no required persisted score | #62 |
| P3-26 | No session attachment | Browse applications | Allow bounded read-only browsing | #64/#55 |
| P3-27 | Unattached session | Highlight/open application | Do not append attachment or change conversation authority | #64/#55 |
| P3-28 | Clean session and valid application | Explicitly attach with required consent | Attach only selected application | #64 |
| P3-29 | Session previously used for another application | Request attachment | Reject; offer explicit fresh-session path | #64 |
| P3-30 | Transient attached session | Shut down | Attachment disappears; approved workspace files remain | #64 |
| P3-31 | Saved attachment whose root is detached or mismatched | Restore | Unavailable attachment; no invented identity | #64 |
| P3-32 | Browsing or confirmed local mutation | Execute action | No automatic provider submission | #64/#65 |
| P3-33 | Synthetic Core/provider/prompt sentinels in memory | Create/migrate/list/derive readiness | No result/prompt/provider bytes persisted | #65 |
| P3-34 | Private paths and document bodies available | Render list projection | Neither appears in list output | #61/#55 |
| P3-35 | Eligible private document | Explicitly open authorized detail/preview | Show bounded exact content only on that local surface | #55/#65 |
| P3-36 | Print or JSON mode | Invoke future `/career` | Fail before private config/session/root/document reads | #54/#55 |
| P3-37 | Failures containing synthetic private sentinels | Render adapter error | Only stable payload-free error; no sentinel or raw stack | #65 |
| P3-38 | Two creators use same application UUID | Commit concurrently | One winner; no alternative-name retry | #55/#65 |
| P3-39 | Two plans for same next revision | Commit concurrently | Single contiguous winner; no silent fork | #62/#65 |
| P3-40 | Failure after artifact publication but before state | Reconcile | Orphan is not current; no implicit adoption | #63/#65 |
| P3-41 | Exact approved state committed before ambiguous failure | Settle/reconcile | Recognize exact committed state idempotently | #65 |
| P3-42 | Crash-left lock | Request mutation | Block; no polling or automatic lock removal | #65 |
| P3-43 | User edited referenced package bytes | Request mutation | Block; preserve bytes; never bless new hash | #65 |
| P3-44 | Just-below/at/above capacity, including post-preview race | Plan/commit | Enforce each independent bound before preview and under lock | #65 |
| P3-45 | Attached persistent application | Use legacy command then overlay | One current authority; cancelled save creates no session-only replacement | #64 |
| P3-46 | Valid session-only application | Open Applications | Distinguish Not persisted from persistent catalog | #63/#55 |
| P3-47 | Existing v1 files and approved migration | Commit migration | Every existing v1 file stays byte-identical | #63 |
| P3-48 | Assisted artifact linked to application | Analyze/match originals | Assisted artifact never becomes eligible original | #64/#56 |
| P3-49 | Valid catalog with no attachment | Browse/open/filter applications | No custom entry, Career Skill metadata, Career tool schema, Core call, or provider call | #64/#55 |
| P3-50 | Valid attachment without activation | Run ordinary model turn | No Career Skill metadata/content or Career tool schema | #64 |
| P3-51 | Valid attached application | Explicitly activate assistance | Append one bounded activation, prepare visible editor handoff, reload resources, and do not submit | #64 |
| P3-52 | Valid persisted activation | Restart/resume | Revalidate exact pointer, then restore only compact managed Skill/tool surface | #64 |
| P3-53 | Activated branch | Navigate before activation or detach | Clear handles/tools and reload without provider/Core use | #64 |
| P3-54 | Session used by one application on any branch | Attach another UUID | Reject and offer explicit replacement-session path | #64 |
| P3-55 | Valid selected application | Open in new Pi session | Seed attachment only through replacement setup; no copied activation/conversation or automatic message | #64/#55 |
| P3-56 | Invalid attachment/activation transition or identity drift | Restore or act | Fail closed with payload-free unavailable/conflict state; append and mutate nothing | #64/#65 |
| P3-57 | No valid activation | Request raw tools | Reject; all four Career tool schemas remain absent from model context | #64 |
| P3-58 | Transient attachment and activation | Reload, then shut down | Work from in-memory entries during process; lose entries and handles at shutdown | #64 |

The ledger preserves all **58** approved Spec 3 IDs (P3-01–P3-58); the first 48 are not the entire current approved map. The #60 disposition test assigns each row exactly once to a behavioral witness or a scenario-specific deferred rationale; the Owner column supplies its owning issue. Currently 20 have scoped witnesses and 38 remain deferred. P3-46 has a synthetic combined Applications view witness: a validated unattached current-session row is marked Not persisted beside persistent records, with read-only TUI/RPC navigation and rescan, unchanged session authority and private-tree bytes, and no Core or automatic send. UUID duplicates and invalid or attached session identities do not create a second row. This local witness does not establish provider-wire behavior. P3-48 has a synthetic mixed v1/v2 application-state chain linking a selected original to an assisted artifact, with a library-visible sidecar-classified copy. Scanner and RPC original selectors exclude that copy; an attached application cannot rebind an original once its artifact is linked. Attached Analyze sends only original bytes to Core, while attached Match intentionally sends the validated effective assisted Resume. Changed artifact bytes and a sidecar bound to a different original block Match without adoption or fallback. The earlier unattached selector test remains a narrower regression; neither test establishes provider-wire behavior. P3-35 has a synthetic RPC/TUI local-preview witness: metadata detail remains body-free until the explicit preview action; eligible Markdown, text, and extracted searchable PDF originals are freshly validated, bounded, and displayed exactly on the transient local surface. Companion attached-workspace UI tests cover current vacancy, selected original, and assisted-labeled effective Resume, with byte/entry/Core checks, stale-source rejection, and exclusion of library assisted variants as originals. This is local UI evidence, not provider-wire acceptance. P3-32/33/34/37 remain bounded by their independent deferrals and are not promoted by this witness. P3-36 needs reliable interception of every private read before print/JSON failure; notification text alone cannot prove ordering. P3-37 needs an injectable logging boundary as well as failure and notification spies. P3-32 and P3-33 require complete provider and persistence instrumentation over the specified actions; existing narrower send and byte assertions do not establish them. P3-26, P3-27, and P3-34 exercise synthetic unattached RPC browse/open and rendered lists with session, invocation, send-path, and private-tree byte assertions; they do not establish model transport behavior or private-read interception. P3-57 remains deferred: inactive raw-tool rejection and active-tool lists cannot establish absence of registered schemas from model context. P3-04 has a catalog test for corrupt manifest, identity, and chain with byte preservation. P3-05, P3-08, P3-20, P3-22, P3-23, P3-29, P3-50, P3-52, P3-53, P3-54, and P3-56 were previously linked to narrower tests that did not establish their full Then clauses. P3-21 (effective-resume change) and P3-30 (process shutdown) also remain deferred: neither is established by an absent-original readiness test or explicit detach. Exact-title pointers are bookkeeping, not proof of semantic fitness; a witness represents only its exercised public boundary, not blanket end-to-end assurance. Foundation issue #65 must verify its own applicable subset and report later scenarios as pending rather than pretending #60 or #65 completes all end-to-end coverage.

## Exact read-only catalog classification contract

This section resolves only the remaining #61 catalog projection. It does not approve state v2, readiness, migration, attachment, overlay UI, or a new persisted schema.

`readApplicationCatalog(rootPath, expectedRootId)` will return one process-memory value:

```json
{
  "schema_version": "pi.career.application_catalog.v1",
  "applications": [],
  "reconciliation": {
    "interrupted": 0,
    "drifted": 0,
    "duplicate_id": 0,
    "unsupported": 0,
    "over_limit": 0
  }
}
```

Exact rules:

- `schema_version`, `applications`, and `reconciliation` are always present in that order. Reconciliation keys are always present in the order shown, including zero counts.
- `applications` contains only completely validated records already approved by #61: `valid` records include immutable exact identity metadata; `legacy` records omit identity; both include only application UUID, lifecycle status, and head update time needed by later local projections.
- Applications remain ordered by head `updated_at` descending, then application UUID ascending. Classification counts never affect ordering.
- Every persistent direct child other than the root marker contributes exactly once: to one valid/legacy application record or to one reconciliation count. The root marker contributes neither.
- Invalid entries never produce an application UUID, path, basename, label, status, timestamp, hash, document body, or raw error in the result. Later UI may render only the five aggregate counts.
- The return value is an internal local projection, not a persisted index, session entry, log, error payload, provider message, or model context. It is freshly derived on every call.

### Root-fatal conditions

The function returns no partial result and throws the existing stable payload-free error when the supplied root itself cannot be trusted:

- invalid/noncanonical/private-root metadata or root-marker bytes;
- root-marker UUID mismatch;
- root direct-child count above the existing bound;
- a live or crash-left root mutation lock; or
- root replacement or entry-set drift while the scan is in progress.

These remain `workspace_root_invalid`, `workspace_identity_conflict`, `workspace_limit_reached`, `workspace_busy`, or `workspace_drift` as applicable. The catalog never converts an untrusted root into an apparently complete set of application-local notices.

### Per-child classifications

After the root envelope is trusted, classification precedence for each direct child is exact:

1. **`duplicate_id`** — two or more package-shaped directories have valid canonical manifests claiming the same manifest UUID. Every claiming directory is removed from `applications` and counted once under `duplicate_id`; no claimant is preferred, even if another file in one claimant would receive a lower-precedence classification.
2. **`over_limit`** — a nonduplicate application-shaped directory exceeds the application-entry, managed-byte, or state-revision bound. Bounded reads stop at the existing overflow sentinel; no truncated record is accepted.
3. **`unsupported`** — a nonduplicate, within-bound application-shaped directory contains canonical package metadata with the expected kind/bindings but an unsupported identity or state schema version. Arbitrary unknown JSON is `drifted`, not evidence of a future schema.
4. **`interrupted`** — a nonduplicate, within-bound application-shaped directory is a recognizable incomplete no-clobber transaction: empty; valid manifest with optional valid identity but no state 1; or known package artifact/temp content without a committed state. It remains read-only and is never completed, cleaned, or adopted by listing.
5. **`drifted`** — every other invalid direct child, including an unknown root entry, unsafe/non-directory application-shaped entry, malformed or misbound manifest/identity/chain, bad parent, gap/fork, orphaned referenced content, unsafe metadata/link, alias, or changed referenced bytes.

If a category cannot be established without trusting malformed/private bytes, use `drifted`. A valid complete chain with absent identity is `legacy`, not `interrupted`. A valid identity with a complete valid chain is `valid`.

### Race and side-effect contract

- Classification is based on one bounded snapshot. Before return, root identity and entry names plus every emitted valid/legacy manifest, identity, head, and referenced current file are revalidated for inode/size/hash consistency. Any observed race rejects the whole call with `workspace_drift`; stale records or counts are never returned.
- The function creates no index, lock, temp, config, identity, state, or session entry; performs no repair/adoption; and invokes no Core resolver, child process, package acquisition, network, provider/model, prompt, or telemetry boundary.
- Behavioral tests must mix valid and every invalid class in one root, prove duplicate removal and exact counts, preserve all bytes/entries across repeated calls, inject a mid-scan race, and assert no private sentinel reaches invalid projections or errors.

This approved contract fixes the #61 API surface. Its implementation remains independently reviewable and does not complete #60 by itself.

## Exact state-v2 and derived-readiness contract

This section resolves the #60/#62 decisions needed before executable v2 fixtures or production parsing. It is a pi-career storage/read contract, not a Career Core schema. It authorizes no state write, migration, cover-letter attachment, session attachment, or overlay behavior.

### Canonical `pi.career.application_state.v2`

The canonical value is:

```json
{
  "schema_version": "pi.career.application_state.v2",
  "kind": "application_state_revision",
  "application_id": "00000000-0000-4000-8000-000000000001",
  "sequence": 4,
  "parent_sha256": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "status": "preparing",
  "vacancy": {
    "relative_path": "vacancy.md",
    "content_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "utf8_bytes": 30,
    "source_state_id": "00000000-0000-4000-8000-000000000080"
  },
  "selected_original": {
    "document_id": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "library_root_id": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "text_sha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "format": "markdown"
  },
  "resume_artifact": null,
  "cover_letter_artifact": {
    "relative_path": "cover-letter.md",
    "artifact_sha256": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "utf8_bytes": 42,
    "format": "markdown",
    "authority": "user_authored",
    "job_description_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "effective_resume_sha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  },
  "updated_at": "2026-08-12T00:00:04.000Z"
}
```

The top-level keys and nested keys occur in exactly the displayed order. `cover_letter_artifact` is either `null` or the exact seven-key object shown. All v1 fields retain their existing unions and meanings:

- `application_id` is one canonical lowercase UUID; `sequence` is a safe integer from 1 through 64 inclusive; `parent_sha256` is 64 lowercase hexadecimal characters.
- `status` is exactly `preparing`, `applied`, `interviewing`, or `closed`.
- `vacancy` is `null` or the existing ordered `{ relative_path, content_sha256, utf8_bytes, source_state_id }` binding. `relative_path` is exactly `vacancy.md` when first introduced at sequence 1 or `vacancy-<six-digit-introducing-state-sequence>.md` when introduced later; carried references retain their original path. `content_sha256` is 64 lowercase hexadecimal characters, `utf8_bytes` is a safe integer from 1 through 262,144 inclusive, and `source_state_id` is a canonical workflow UUID.
- `selected_original` is `null` or the existing ordered `{ document_id, library_root_id, text_sha256, format }` binding. Its three IDs/digests are each 64 lowercase hexadecimal characters and `format` is `markdown`, `text`, or `pdf`.
- `resume_artifact` is `null` or the existing ordered `{ relative_path, artifact_sha256, sidecar_relative_path, sidecar_sha256 }` binding. Its artifact path is exactly `resume.md` or `resume.txt`; its sidecar path is exactly `resume.pi-career.json`; both hashes are 64 lowercase hexadecimal characters. Exact artifact bytes are 1 through 262,144 bytes and the sidecar is 1 through 16,384 bytes.
- `updated_at` is a real canonical UTC timestamp with milliseconds. Sequence 1 is not earlier than `workspace_created_at`; every later state timestamp is strictly later than its predecessor.

A state file is fatal-UTF-8 canonical two-space JSON plus one LF, with no BOM, duplicate decoded key, unknown key, trailing data, or noncanonical value, and is 1 through 16,384 bytes. It remains an owner-only `0600`, one-link, non-symlink regular file. The application entry limit of 160, managed-byte limit of 2,097,152, total state-revision limit of 64 across both versions, and complete-preview limit of 5,242,880 remain independent unchanged ceilings.

`Ready`, component classifications, match scores, Core results, provider data, prompts, session IDs, absolute paths, and document bodies are not additional state keys.

### Exact cover-letter reference

A non-null `cover_letter_artifact` has these rules:

1. `relative_path` is one package-generated direct-child basename. The first distinct letter is `cover-letter.md` for `markdown` or `cover-letter.txt` for `text`. Every later distinct letter is `cover-letter-<six-digit-introducing-state-sequence>.md` or `.txt`. The suffix must equal the state sequence that first introduces those exact bytes. No separator, absolute form, dot component, control character, alternative padding, or user-selected name is accepted.
2. `artifact_sha256` is SHA-256 over the exact artifact bytes and is 64 lowercase hexadecimal characters. `utf8_bytes` is their exact byte length and is a safe integer from 1 through 262,144 inclusive.
3. The artifact is fatal UTF-8 text with no BOM, NUL, carriage return, or unpaired surrogate after decoding. Bytes are otherwise preserved exactly; pi-career adds no heading, whitespace, or trailing LF. `format` is exactly `markdown` or `text` and must match the filename extension.
4. `authority` is exactly `user_authored`. No other authority value is valid in v2. A future assisted authority requires a separately approved schema/version and cannot be smuggled in as an unknown v2 value.
5. `job_description_sha256` and `effective_resume_sha256` are each 64 lowercase hexadecimal characters and bind the letter to the same revision's package-derived dependency digests defined below.
6. There is no cover-letter sidecar in v2. Authority, size, exact-byte hash, format, and dependencies live only in the immutable state reference. A draft cannot be attached before both dependencies can be derived. Draft storage outside this exact approved artifact transaction is not introduced.
7. Carrying an unchanged reference into a later state is allowed and is how a letter becomes stale after a dependency changes. A rebind may retain the exact path, artifact hash, size, format, and authority while changing only the two dependency hashes, but it is a distinct explicitly reviewed future transaction and both new hashes must match that revision's dependencies. New bytes require a new immutable numbered path. One historical path may never claim different bytes, size, format, or authority.
8. Every referenced cover-letter file is a direct-child owner-only `0600`, one-link, non-symlink regular file with exact size/hash. It counts toward the existing entry and managed-byte ceilings. Publication, preview, confirmation, and commit ordering remain outside this read-contract slice.

### Exact digest domains

The **current job-description digest** exists only when the head `vacancy` binding is non-null and its exact package file validates. Its value is `vacancy.content_sha256`, verified as SHA-256 over the exact accepted job-description file bytes. There is no Unicode, whitespace, line-ending, Markdown, URL, or Core normalization at readiness time.

The **effective-resume digest** exists only when the Resume component is `Available`:

- for an effective original, it is `selected_original.text_sha256`, freshly verified against the eligible original's current scanner `text_sha256`; or
- for an effective tailored artifact, it is `resume_artifact.artifact_sha256`, freshly verified against the exact package artifact bytes.

The scanner-text digest is SHA-256 over the UTF-8 encoding of the existing scanner text: fatal UTF-8 decoded Markdown/text or current PDF extractor text, with CRLF and CR converted to LF and no other Unicode, whitespace, or content normalization. This names the existing pi-career scanner domain; it does not copy or replace a Career Core algorithm. The tailored digest is over exact artifact bytes, not scanner-normalized text. No domain prefix, JSON wrapper, sidecar bytes, path, document ID, or format is added to either dependency digest.

### Mixed-version complete-chain validation

A complete chain contains one through 64 total revisions and is exactly one of: all v1; all v2; or a contiguous v1 prefix followed by a contiguous v2 suffix. A v2-to-v1 transition anywhere is a downgrade and invalidates the whole chain. An existing all-v1 chain stays readable and byte-identical indefinitely.

The following rules are fail-closed and never select a last-known-good prefix:

1. State basenames start at `.pi-career-state-000001.json`, increase by exactly one, and agree with each embedded `sequence`. Any missing sequence, duplicate/alternate state-shaped basename, embedded mismatch, or revision above 64 is a gap/duplicate and invalidates the chain.
2. Sequence 1's `parent_sha256` hashes the exact manifest bytes. Every later parent hashes the exact complete canonical bytes of the immediately preceding revision, regardless of schema version. A parent to any earlier revision, unknown bytes, or competing lineage is a fork/bad parent and invalidates the chain.
3. Every revision binds the manifest application UUID and satisfies the timestamp rules above. The manifest, identity when present, directory, state metadata, and every package-local reference retain their existing private metadata, containment, byte, hash, and aggregate-bound checks.
4. A canonical, correctly bound `pi.career.application_state.vN` with unsupported `N` makes the whole entry `unsupported`; no prefix is current. Malformed JSON, arbitrary schema text, unknown kind/binding, or noncanonical future-looking bytes are `drifted`, not `unsupported`.
5. The first v2 after a v1 head is a transition revision. `status`, `vacancy`, `selected_original`, and `resume_artifact` must equal the v1 head exactly. `cover_letter_artifact` must be `null`, except that a separately approved cover-letter attachment transaction may introduce a non-null reference whose dependencies match that same snapshot. No status, vacancy, original, or resume-artifact change may be combined with this transition. Sequence, parent, schema, and later timestamp necessarily change.
6. A new application's sequence 1 may be v2 but must have `cover_letter_artifact: null`. No rule rewrites or replaces an earlier v1 file. If a 64-revision v1 chain has no capacity for a transition, it remains readable but cannot append; there is no compaction or implicit limit increase.
7. `resume_artifact` requires non-null `selected_original`. Its exact v2 assisted sidecar must identify `assisted_non_authoritative`, bind the stored original document/text digest, and bind the exact artifact hash before the artifact can be effective. A selected-original change while an artifact is referenced is invalid unless the same next snapshot clears the artifact; there is no fallback from an invalid referenced artifact to the original.
8. A newly introduced or explicitly rebound cover-letter reference must match the job/effective-resume digests derivable from that revision's metadata. A byte-identical carried reference may mismatch a later snapshot and is then valid history but `Stale` at that head.

Every package-local file referenced by any revision remains immutable managed history and is checked for exact path, type, owner, mode, link count, size, and hash. Reuse of one path with conflicting immutable metadata is structural drift. Missing or changed historical-only vacancy, resume artifact, sidecar, or cover letter invalidates the complete chain when the head no longer references it; no component projection can hide damaged history. A stable failure of a well-formed head reference instead gives that current component the diagnostic classification `Drifted`, excludes the application from valid catalog records, and blocks Ready. Orphan package-shaped files are never adopted as history.

Historical `selected_original` bindings are different because their bytes live in an external Resume library: non-head bindings are structurally and chain validated but are not freshly rescanned. An absent or changed historical original therefore does not prevent reading an otherwise intact chain. Only the head selected-original binding is resolved through one fresh complete bounded scan for readiness. No historical source is reconstructed from a sidecar, artifact, chat, or provider content.

A downgrade, gap, fork, unsupported version, malformed revision, conflicting path reuse, or historical-only managed-reference failure yields no trusted head, no `current` label, and no readiness projection. A structurally valid candidate head with a stable current-reference failure may produce only the diagnostic `Drifted` component projection defined below; it is not a valid/current catalog record. Catalog discovery uses its existing aggregate `unsupported`, `drifted`, or `over_limit` classification and exposes no invalid private detail.

### Pure component classifications

The classification vocabulary is closed and case-sensitive: `Missing`, `Available`, `Stale`, `Unavailable`, and `Drifted`. Classification and readiness derivation are deterministic functions of a validated state snapshot plus bounded read evidence; they do not mutate either input.

**Job description**

- `Missing`: head `vacancy` is `null`.
- `Available`: the non-null reference and exact current package bytes validate.
- `Drifted`: the well-formed non-null local reference has stably absent, changed, unsafe, aliased, or over-bound package bytes/metadata.
- `Stale` and `Unavailable` are not emitted for this package-local component. There is no URL fetch or alternate source fallback.

**Resume**

- `Missing`: both `selected_original` and `resume_artifact` are `null`.
- `Available`: one fresh complete uncapped scan finds exactly one eligible original matching the stored document ID, root ID, format, and scanner-text digest, and either no tailored artifact is referenced or the exact artifact/sidecar and source binding also validate.
- `Stale`: the same uniquely identified eligible original is found but its current format or scanner-text digest differs from the binding. A referenced tailored artifact cannot hide this and no original/artifact is silently substituted.
- `Unavailable`: the binding cannot be conclusively checked because the configured root/source is absent or stale, extraction/read fails, the candidate is missing, ambiguous, assisted/quarantined rather than original, or a root/total scan cap is reached.
- `Drifted`: package-local artifact/sidecar bytes or metadata stably fail, or the hash-valid sidecar authority/source binding contradicts the well-formed state. An artifact without a selected original is structural chain drift and yields no component projection. There is no fallback to the selected original while a referenced artifact is stale, unavailable, or drifted.

When Resume is `Available`, effective-resume selection is exact: choose `tailored` when a non-null current `resume_artifact` and its source binding validate; otherwise choose `original` from the valid selected-original binding. Every other Resume classification yields no effective source and no effective-resume digest. Merely finding another original, an assisted variant, or matching text under another identity never changes the selection.

**Cover letter**

- `Missing`: `cover_letter_artifact` is `null`.
- `Available`: its exact local artifact validates, both current dependency digests exist, and both equal the stored dependency hashes.
- `Stale`: its exact local artifact validates, both current dependency digests exist, and either stored dependency hash differs.
- `Unavailable`: its exact local artifact validates but one or both current dependencies have no digest because the corresponding component is not `Available`.
- `Drifted`: its well-formed reference has stably missing, changed, unsafe, or over-bound exact local bytes/metadata.

After structural chain validation, a null reference is `Missing`; a non-null reference with failed local evidence is `Drifted`; a locally valid cover then resolves dependency `Unavailable`, mismatch `Stale`, or `Available` in that order. Impossible or malformed state combinations are structural chain drift and return no component projection at all. A diagnostic surface may report a well-formed current component as `Drifted`, but catalog discovery must continue to exclude the application from valid/legacy records.

### Readiness truth table

Let `J`, `R`, and `C` mean that Job description, Resume, and Cover letter respectively classify exactly `Available`. `n` is exactly the number of true values; `Missing`, `Stale`, `Unavailable`, and `Drifted` each contribute zero. Lifecycle status and match-result presence contribute nothing.

| J | R | C | Projection | Reachability |
|---|---|---|---|---|
| no | no | no | `Incomplete 0/3` | yes |
| yes | no | no | `Incomplete 1/3` | yes |
| no | yes | no | `Incomplete 1/3` | yes |
| no | no | yes | impossible; cover must be `Unavailable` or `Drifted` | no |
| yes | yes | no | `Incomplete 2/3` | yes |
| yes | no | yes | impossible; cover must be `Unavailable` or `Drifted` | no |
| no | yes | yes | impossible; cover must be `Unavailable` or `Drifted` | no |
| yes | yes | yes | `Ready 3/3` | yes, only with no application blocker |

`Ready 3/3` additionally requires a trusted manifest/identity/root, a complete supported chain, all historical managed references valid, and no root/application collision, drift, race, unsupported schema, or exceeded bound. If that envelope is not trusted, the application is not projected as Ready regardless of three isolated component observations. `preparing`, `applied`, `interviewing`, and `closed` all use this same table. A match result is neither read nor persisted for readiness.

### Races, privacy, errors, and forbidden effects

- Chain/reference/evidence reads are bounded. Before return, the reader revalidates root/application identity and entry set plus every manifest, identity, revision, current/historical managed file, and selected-original scan evidence used by the result. Any observed replacement, inode/size/hash/metadata change, entry-set change, or newly capped scan fails with `workspace_drift`; no stale or partial projection is returned.
- An unsupported canonical state remains the aggregate `unsupported` classification during catalog discovery. Limit overflow remains `over_limit`. Direct attached reads use only existing stable payload-free workspace failures; this slice adds no error string containing a path, basename, label, UUID, hash, document bytes, schema bytes, environment value, raw filesystem error, or stack.
- Parsing and derivation create no index, lock, temp, config, identity, revision, artifact, sidecar, cache file, session entry, prompt, result, or log. They perform no repair, adoption, migration, attachment, compaction, deletion, URL fetch, Core resolution/invocation, child process, npm acquisition, provider/model call, network call, telemetry, or automatic prompt submission.
- Complete document bytes and absolute paths remain confined to an explicitly authorized future local detail/preview surface. Catalog/readiness values, adapter errors, logs, provider context, and session entries receive neither. Digests are internal integrity/dependency evidence and are not displayed by list projections or errors.
- Cancellation before a read begins returns without private access. Cancellation or a race during the bounded read returns no partial result. Because this slice is read-only, there is no settlement-after-commit path and no retry through another runtime route.

### #60 synthetic fixture and ownership map for this contract

Fixtures use fixed synthetic UUIDs/timestamps/labels and generated private temporary roots. Document bytes are short strings such as `Synthetic job description.`, `Synthetic original resume.`, and `Synthetic user-authored letter.` Expected canonical bytes and hashes are computed by test-only builders that do not import the production parser as their sole oracle.

| Fixture family | Required variants | Spec 3 scenarios | Implementation owner |
|---|---|---|---|
| `state-v2-canonical` | sequence-1 v2; v1 head plus null-cover transition; separately represented cover-introduction transition; lower/at/above metadata and revision bounds | P3-08, P3-09, P3-47 | #60 fixtures; #62 reader; #63 writer/migration |
| `mixed-chain` | all-v1, all-v2, v1→v2, v2→v1 downgrade, gap, embedded-sequence mismatch, bad parent/fork, canonical unsupported version, malformed future-looking version | P3-04, P3-08, P3-09, P3-10 | #60 fixtures; #62 reader |
| `historical-references` | carried vacancy/artifact/letter; cleared current references; absent historical external original; missing/changed historical managed file; conflicting path reuse | P3-04, P3-20, P3-21, P3-43, P3-47 | #60 fixtures; #62 reader; #65 integration |
| `cover-letter-reference` | Markdown/text first and numbered paths; rebind with identical bytes; bad authority/format/path/hash/dependency; bytes 0/1/262,144/262,145 | P3-19, P3-20, P3-21, P3-44 | #60 fixtures; #62 validation; later #57 writer |
| `package-completeness` | every reachable availability row; each non-Available class for each component; applied/closed lifecycle; no match result | P3-16 through P3-25 | #60 fixtures; #62 derivation; #55 creation presentation |
| `source-authority` | current/changed/missing original; stale/capped/ambiguous scan; assisted/quarantined candidate; valid and source-mismatched tailored artifact | P3-18, P3-21, P3-22, P3-23, P3-48 | #60 fixtures; #62 derivation; #64/#56 convergence |
| `read-races-and-privacy` | revision, historical/current artifact, selected source, and entry-set replacement during read; synthetic private sentinels in failures and spies | P3-33, P3-37, P3-39, P3-43, P3-44 | #60 fixtures; #62 reader; #65 adversarial integration |
| `transaction-orphans` | cover/artifact published without state and exact state committed after ambiguous failure | P3-40, P3-41 | #60 fixtures; later writer issue; #65 settlement |

The #60 fixture slice may encode these approved bytes and corruption cases without adding production behavior. Fixture validation alone does not satisfy a behavioral scenario: #62 must exercise the future public read/derivation boundary, and #63/#57/#65 retain their mutation, fault-injection, and integration rows. No fixture may contain a real company, role, resume, job description, cover letter, credential, provider response, session file, machine-specific path, or Core checkout.

## Synthetic fixture families

- `empty-root`: canonical private root and valid marker, no applications.
- `legacy-v1`: immutable manifest, contiguous v1 states, optional vacancy, no display identity.
- `identified-v1`: valid legacy chain plus approved exact identity metadata.
- `mixed-chain`: v1 prefix and v2 suffix; include downgrade, gap, duplicate, unsupported-schema, and bad-parent variants.
- `package-completeness`: independent job/resume/letter missing/current/stale/drifted states.
- `source-authority`: originals, valid assisted variants, quarantined sidecars, changed originals, missing roots, capped scans.
- `session-attachment`: clean, prior-other-application, persisted, transient, branched, detached-root and mismatched identity.
- `transaction-faults`: failures at each publication/sync/revalidation boundary; exact committed versus orphaned states.
- `capacity`: independently generate below/at/above each bound and concurrent changes after preview.

Use fixed synthetic UUIDs/timestamps and generated temp-root paths. Hash expected bytes directly; do not import production parsers to manufacture the sole expected test oracle. Full fixtures for new schemas wait for their exact contract approval.

## Approved #64 command-authority matrix — implemented for application/vacancy/Resume commands

| Interface | No attachment | Valid attachment, no activation | Valid activated attachment |
|---|---|---|---|
| `/career-application` | Preserve legacy session-only behavior and explicit workspace creation | Show/update workspace lifecycle only through a previewed file mutation; never append competing session status | Same workspace authority; model activation grants no mutation |
| `/career-application clear` | Preserve legacy clear boundary | Explicit Detach appends only the exact detachment; retain used-application claim and all files | Detach also clears ephemeral handles and reloads away Career model resources |
| `/career-vacancy` | Preserve legacy session vacancy behavior | Validate through Core, then preview/confirm workspace revision; cancellation changes neither workspace nor session | Same workspace transaction; no provider call and no session-only vacancy mirror |
| `/career-workspace` | Configure, initialize, migrate, and reconcile as explicitly available | Administer/reconcile exact attached workspace; no silent synchronization | Same local authority |
| `/career-match`, `/career-analyze` | Existing explicit deterministic source/consent behavior | Read fresh validated workspace bindings; match uses the effective Resume, analyze uses only the selected original | Same deterministic behavior; activation does not route commands through a model |
| `/career-workbench` and overlay assistance | Require explicit attachment first; never combine decisions | Explicit action appends activation, prepares `/skill:career-core …`, and reloads; no submission | Reuse activation and stable editor/tool surface; append nothing |
| `career_run` | Inactive and absent from model context | Inactive and absent from model context | Resolve ephemeral handles from fresh validated workspace sources; no implicit mutation |
| `/career-tools raw` | Reject | Reject | Explicitly add exact raw compatibility tools for this runtime only; managed/reset removes them |
| `/career-save` | Existing independent variant-save contract when a legacy ephemeral handle exists | No handle until assistance runs | Independent preview/confirmation; never attaches artifact to application implicitly |
| Future `/career` | Browse without attachment | Open attached detail; browsing another application never replaces attachment | Same local browsing behavior; no automatic model message |

Application, vacancy, match, analyze, workbench, and `career_run context` now follow this matrix when a persistent application is attached. Unattached `/career-workbench` still prepares the legacy editor prompt. Overlay `/career` browsing and `/career-save` application binding remain later. Each remaining overlay implementation must add behavioral tests and preserve the existing privacy, preview, consent, cancellation, and race gates. Opening the overlay is never consent.

## Capacity findings and remaining decisions

Observed current source limits in `src/workflow/application-workspace.ts`:

| Bound | Current value |
|---|---:|
| Root persistent entries including marker | 1,024 |
| Application persistent entries including unknown user files | 160 |
| State revisions | 64 |
| Managed application bytes | 2,097,152 |
| Mutation preview bytes | 5,242,880 |
| Metadata bytes per file | 16,384 |
| Vacancy/artifact content ceiling used by current validation | 262,144 |

These are independent ceilings, not guaranteed capacity for 64 maximum-sized documents.

Including the immutable identity, the maximal v1 shape is 132 files before unknown user entries: manifest + identity + 64 states + 64 job-description files + one resume/sidecar pair. Distinct cover letters can therefore exhaust 160 entries before 64 states. The fixed accounting formula is `2 + S + J + 2R + C + U`, where `S` is state files, `J` is distinct job-description files, `R` is distinct resume artifact/sidecar pairs, `C` is distinct cover-letter files, and `U` is unknown user entries. A cover-letter rebind that reuses exact bytes adds a state but no second artifact; v2 has no cover-letter sidecar.

Retain limits by default; reject over-capacity plans before preview and under lock. Preview size must be checked using actual canonical encoded preview bytes: JSON escaping means a 2-MiB managed-byte budget does not prove that a complete preview fits 5 MiB. No truncation, compaction, deletion, or larger bounds without separate approval.

The state-v2 schema, cover-letter reference, digest domains, mixed-chain validation, historical-reference behavior, component classes, readiness table, and #64 attachment/activation contract are fixed above and in `application-workspaces.md`. Remaining decisions are:

1. #64 behavior slices must implement strict entry replay, pointer revalidation, command convergence, safe explicit session replacement, and context-on-demand activation without combining them into an unreviewable UI change.
2. #57 must define cover-letter authoring/rebind preview, confirmation, publication, crash settlement, and user-visible draft behavior. No draft is persisted by the state-v2 reference contract.
3. Later overlay issues must decide presentation copy and local detail navigation without changing classification/readiness semantics or exposing invalid-entry detail.
4. #65's integration checks remain scoped: explicit consented attachment/activation entries are permitted by #64; blanket “no session append anywhere” would contradict reviewed session persistence.

## Small PR sequence

Each item is a separate reviewable change, not a promise to implement its entire parent issue at once. Do not combine persistence and overlay behavior in a single PR.

1. **#60 acceptance baseline (landed):** this ledger, its structural completeness check, and a real v1 read-only reconciliation regression.
2. **#61 identity/catalog foundation (landed):** strict identity parsing/publication and bounded classified discovery without UI.
3. **#60/#62 exact state/readiness contract (this slice):** the schema, dependency, chain, classification, readiness, side-effect, and fixture ownership decisions above; no production behavior.
4. **#60 fixture support:** independent synthetic byte builders and corruption cases for the reviewed contract. Fixture checks do not count as workflow coverage.
5. **#62 state reader, then readiness:** separate mixed-chain validation and pure readiness changes.
6. **#63/#64:** migrate one explicit transaction or converge one command family per PR; strict #64 record parsing/replay lands before filesystem validation, command wiring, or context activation; no bulk migration or all-command rewrite.

Keep each PR independently testable. Add failing behavioral tests and the minimal implementation together when a new boundary is introduced, rather than landing a broken default test suite. Release and remote Git operations remain separately authorized.

### Current coverage evidence

- `tests/workflow/persistence-acceptance.test.mjs` validates ledger IDs/owners and checks a unique 58-row disposition against actual behavioral test titles (14 witnessed, 44 deferred). This is bookkeeping, not itself behavioral coverage. Deferred rationales remain alongside the evidence map in that test, with owner issue links in the ledger. Some witnesses cover only read or derivation slices: append, UI rendering, race/settlement, and provider-spy requirements remain deferred, even where a fixture or narrower read test exists.
- `tests/workflow/fixtures/persistence-v2.mjs` and `tests/workflow/persistence-fixtures.test.mjs` provide production-independent canonical byte builders, private temporary-root materialization, and the eight reviewed fixture/corruption families. They map each family to its P3 rows but deliberately do not import or validate a production v2 reader, derive production readiness, or count fixture checks as behavioral coverage.
- `tests/workflow/application-state-v2-reader.test.mjs` exercises the production catalog/read boundary against all-v1, all-v2, v1→v2, downgrade, gap, fork, unsupported, malformed, historical-reference, exact cover-letter, source-bound tailored-artifact, and mutation-free v2 source-failure cases. It snapshots bytes around reads and proves no read-time mutation; it does not claim readiness coverage.
- `tests/workflow/application-readiness.test.mjs` exercises the pure production derivation boundary against every reachable availability row, each non-Available class, original-source outcomes, tailored selection, cover dependency precedence, determinism, and output privacy. It accepts only an already validated snapshot and supplied bounded scan evidence; filesystem race/revalidation and future catalog/detail presentation remain #65 and the overlay slices.
- `tests/workflow/session-attachment.test.mjs` exercises the pure #64 strict parsers, factories, active-branch replay, all-entry one-application claim, detach/reattach scope, malformed transitions, determinism, and output privacy. It does not claim filesystem pointer validation, Pi event wiring, command convergence, resource activation, or overlay coverage.
- `tests/workflow/session-attachment-validation.test.mjs` exercises fresh filesystem pointer validation against one exact configured root, valid identity, missing config, legacy identity, root/manifest timestamp drift, renamed directories, drifted state, and duplicate UUID claims. It snapshots bytes around reads and returns no paths.
- `tests/workflow/session-model-surface.test.mjs` exercises context-on-demand resolution and Pi wiring: no Career tools/Skill path without activation, managed `career_run` plus `skills/` discovery after valid activation and pointer validation, raw-tool rejection outside activation, and `/skill:career-core` handled without a model turn.
- `tests/workflow/session-attachment-commands.test.mjs` exercises explicit attach/detach/assistance-activation through `/career-workspace`: confirmation-gated pointer append, cancellation, document-free editor handoff, reload after activation/detach, and unchanged workspace bytes.
- `tests/workflow/session-catalog-attach.test.mjs` exercises attaching a validated catalog application from a clean Pi session and opening another application only through replacement-session setup. Overlay UI remains later.
- `tests/workflow/command-authority.test.mjs` exercises attached `/career-vacancy`, `/career-match`, `/career-analyze`, `/career-workbench`, and `career_run context`: workspace files are the only current vacancy/Resume authority, cancelled vacancy saves change neither workspace nor session, match uses the effective Resume, analyze uses only the selected original, and workbench/assistance never auto-submit.
- `tests/workflow/application-status-authority.test.mjs` exercises attached `/career-application` status and clear: workspace lifecycle updates are previewed file mutations, cancelled updates change neither authority, and clear detaches without session-only status/vacancy or workspace-file changes.
- The `P3-08` test in `tests/workflow/application-workspace.test.mjs` exercises existing v1 reconciliation twice and checks complete config/marker/workspace/original bytes, directory entry sets, session entries, and Core invocation count. The #63 cases separately exercise non-authoritative legacy slug projection, exact identity-only migration, cancellation, state/session races, blocked pre-migration writers, unchanged historical bytes, and the null-cover v1→v2 transition only when a later state mutation is requested. They do not prove overlay, provider/network, or session-attachment behavior.
- Other ledger rows remain specifications, not newly implemented tests. The 44 deferred rows require issue-owned behavioral integration; the map intentionally refuses to count fixture-only or narrower read evidence as completed mutation/UI coverage. #60 remains open pending review of these deferrals and further end-to-end coverage.

## Next gate

The exact state-v2/readiness contract, #60/#62 foundations, and #63 migration are implemented. #64's attachment bytes, branch/restart/detach lifecycle, command authority, and context-on-demand mechanism are fixed; parsing/replay, pointer validation, on-demand Skill/tool discovery, explicit attach/detach/assistance-activation commands, catalog attach from any session, and application/vacancy/Resume command-authority convergence are implemented. Overlay UI remains later. #57 retains cover-letter writes. Keep #60 open until remaining filesystem-race/integration rows are exercised or explicitly deferred in review.
