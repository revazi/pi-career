# Persistence acceptance preparation — issue #60

Status: **draft acceptance contract; not executable coverage or implementation approval**.

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

Some scenarios need later overlay/artifact slices. Foundation issue #65 must verify its own applicable subset and report later scenarios as pending rather than pretending #60 or #65 completes all end-to-end coverage.

## Proposed exact read-only catalog classification contract — approval required

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

Approval of this section fixes the #61 API contract and permits one separate implementation PR. It does not complete #60 or #61 by itself.

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

## Proposed command-authority matrix — approval required

| Interface | No persistent attachment | Valid persistent attachment |
|---|---|---|
| `/career-application` | Preserve current session-only behavior; offer explicit workspace creation | Show/update workspace lifecycle through a separately previewed file mutation |
| `/career-application clear` | Preserve legacy clear boundary | Explicitly detach; retain used-application session boundary and all files |
| `/career-vacancy` | Preserve current session vacancy behavior | Validate candidate through Core, then explicit workspace preview/confirm; cancelled save leaves both authorities unchanged |
| `/career-workspace` | Configure, initialize, migrate, reconcile as explicitly available | Administer/reconcile attached application; no silent synchronization |
| `/career-match`, `/career-analyze` | Existing source/consent behavior | Read current validated application bindings for match; analyze only originals |
| `/career-workbench` | Existing visible editor handoff | Read current attached application; no automatic provider submission |
| `career_run context` | Existing legacy context | Expose ephemeral handles resolved from validated workspace sources; no mutation |
| `/career-save` | Existing independent variant-save contract | Still independent; does not attach artifact to application implicitly |
| Future `/career` | Browse without attachment | Open attached detail, but browsing another application never replaces attachment |

No proposal above changes the current command contracts until explicitly reviewed and implemented. In particular, workspace-backed model-readable content still requires the existing session/provider privacy decisions; opening the overlay is not consent.

## Capacity findings and unresolved decisions

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

The previous maximal 131-file package set gains one identity file. Repeated resume/letter artifact pairs can exhaust 160 entries before 64 states. A candidate accounting formula is `2 + S + J + 2R + 2C + U`, where `S` is states, `J` job files, `R` resume pairs, `C` cover-letter pairs, and `U` unknown user entries. This assumes a separate cover-letter sidecar, which remains **proposed**, not an approved schema.

Retain limits by default; reject over-capacity plans before preview and under lock. Preview size must be checked using actual canonical encoded preview bytes: JSON escaping means a 2-MiB managed-byte budget does not prove that a complete preview fits 5 MiB. No truncation, compaction, deletion, or larger bounds without separate approval.

Resolve before executable new-schema fixtures and production changes:

1. Exact cover-letter reference/sidecar schema, field order, authority values, names, text and metadata bounds; handling a draft without job/resume prerequisites.
2. Exact session attachment schema, consent, branch/clear semantics, command matrix above, and safe explicit session replacement.
3. Binding display identity to the state chain and crash classification for identity-without-state; migration cannot compare exact labels against a manifest that intentionally stores no labels. Validate session-derived expected location, UUID and timestamp instead; final algorithm needs review.
4. Historical versus current dependency validation: historical original references must not require absent historical originals to remain forever readable merely to inspect the chain; corruption of immutable managed historical files still follows the existing drift contract.
5. Digest definition for effective original versus saved assisted bytes; choose and document normalization domain so dependency comparisons are unambiguous.
6. Exact mixed-chain parser contract. The read-only catalog projection is proposed above; new-application manifest/identity/optional-vacancy/state-last order is documented in the current workspace protocol.
7. Keep #65's integration checks scoped: explicit consented attachment entries are permitted by #64; blanket 'no session append anywhere' would contradict attachment persistence.

## Small PR sequence

Each item is a separate reviewable change, not a promise to implement its entire parent issue at once. Do not combine persistence and overlay behavior in a single PR.

1. **#60 acceptance baseline (this slice):** this ledger, its structural completeness check, and a real v1 read-only reconciliation regression. No new schema or runtime behavior.
2. **#60 exact-contract decisions:** command-authority matrix and exact identity/state/attachment/artifact contracts, with unresolved choices explicitly reviewed before code.
3. **#60 fixture support:** independent synthetic byte builders and corruption cases for approved schemas. Fixture checks do not count as workflow coverage.
4. **#61 identity reader:** strict immutable identity parsing and negative cases, without writes or UI.
5. **#61 catalog reader:** bounded discovery, ordering, duplicate detection, and legacy classification.
6. **#61 identity publication:** one approved no-clobber transaction with cancellation/race tests.
7. **#62 state reader, then readiness:** separate mixed-chain validation and pure readiness changes.
8. **#63/#64:** migrate one explicit transaction or converge one command family per PR; no bulk migration or all-command rewrite.

Keep each PR independently testable. Add failing behavioral tests and the minimal implementation together when a new boundary is introduced, rather than landing a broken default test suite. Release and remote Git operations remain separately authorized.

### Current coverage evidence

- `tests/workflow/persistence-acceptance.test.mjs` checks only ledger IDs, fields, and ownership; it is not behavioral coverage.
- The `P3-08` test in `tests/workflow/application-workspace.test.mjs` exercises existing v1 reconciliation twice and checks complete config/marker/workspace/original bytes, directory entry sets, session entries, and Core invocation count. It does not prove future v2, overlay, or provider/network instrumentation behavior.
- Other ledger rows are specifications, not newly implemented tests. #60 remains open.

## Next gate

Approve/refine the read-only catalog contract above, then implement its substantive behavioral tests and minimal projection in one separate #61 PR. Independently approve the command matrix and resolve the remaining exact state/attachment/artifact schemas before their fixture or production slices. Keep #60 open until its executable coverage or explicit later-slice deferrals are reviewed. No production code has been changed by this document.
