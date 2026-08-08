# Managed Career Core and `career_run` roadmap

## Status

This document records a planned cross-repository migration. It does not describe currently available behavior and does not authorize implementation, persistence, publication, or runtime changes by itself.

The sequence is fixed:

1. Authorize and implement Career Core Phase 8 managed-adapter support.
2. Produce and review new native Career Core artifacts through the existing bounded handoff workflow.
3. Import the reviewed artifacts into pi-career with updated provenance and compatibility checks.
4. Implement and review pi-career's `career_run` design and agent workflow.
5. Measure the complete synthetic workflow against explicit context, privacy, retention, and interaction budgets.

## Findings motivating the migration

The integration gap is adapter design rather than implementation language. Pi Fallow also invokes its Rust core through a CLI subprocess, but provides a substantially more agent-oriented boundary:

- one compact `fallow_run` tool
- implicit project context
- simple command routing
- compact summaries with detail on demand
- progress and custom rendering
- interactive finding navigation and selection
- cached runtime resolution and normalized output
- token and performance benchmarks

Local `o200k_base` measurements taken during the design review:

| Surface | Tokens |
|---|---:|
| Current `fallow_run` contract | 338 |
| Current three pi-career native tool contracts | 1,041 |
| Empty synthetic career workbench prompt before real source content | 706 |
| Small synthetic Career Core analysis-replacement review result | 4,744 |

The current raw-tool workflow can require the model to discover schemas, manually construct nested JSON strings, repeat complete original/proposal payloads, parse exhaustive Core results, and reconstruct a materialization envelope containing the full review input. This increases context use and created avoidable malformed-envelope and exact-evidence-target friction in a representative end-to-end resume workflow.

## Target agent experience

The planned primary interface is one compact high-level Pi tool:

```text
career_run context
career_run analyze --resume master
career_run match --resume master --vacancy current
career_run variant-review --resume master --vacancy current --changes [...]
career_run materialize --review <id> --selected [...]
career_run detail --result <id> --section evidence
career_run save --variant <id>
```

This is an illustrative workflow, not the final Pi tool schema. Private document text must continue to travel only through bounded stdin at the Career Core process boundary, never through CLI arguments.

Career Core remains authoritative for operations, schemas, algorithms, typed errors, evidence, warnings, uncertainty, ordering, deterministic baselines, and assisted/non-authoritative semantics. Pi-career owns handles, orchestration, projection, interaction, and explicitly approved persistence.

## Career Core Phase 8: managed-adapter support

Career Core currently has no active implementation phase. A new, explicitly authorized Phase 8 should add only the machine contracts needed by a reviewed managed adapter.

### Operation catalog

Add a deterministic machine command such as:

```text
career operations --format json-compact
```

It should return a versioned `career.operation_catalog.v1` document mapping every callable available operation to:

- stable operation ID
- availability status
- CLI path segments
- input transport
- input schema ID, when applicable
- output schema ID
- maximum input bytes
- maximum successful machine-output bytes

Do not add fields to `career.capabilities.v1`: its current schema rejects additional properties. The operation catalog should be a separate compatible contract with stable ordering and complete capability/operation mapping tests.

### Self-contained schema bundles

Add a deterministic offline command such as:

```text
career schema bundle --id career.resume_variant_review_input.v1
```

Alternatively, add a backwards-compatible `--bundle` flag to `schema export`. Bundled output must recursively resolve only embedded local references, require no source checkout or network, remain valid Draft 2020-12 JSON Schema, and be deterministic and bounded. Existing unbundled schema-export bytes must remain unchanged.

This lets pi-career validate exact Core envelopes without copying Core schemas into TypeScript or exposing schema discovery to the model during normal workflows.

### Machine-output bounds

Document and enforce either one global maximum successful JSON output size or an exact per-operation maximum in the operation catalog. The bound must be sufficient for every valid bounded Core result.

Pi-career can then capture complete authoritative JSON within that limit, keep it only in ephemeral memory, and expose compact model-facing projections with explicit detail hydration. An oversized Core result must never be silently truncated.

### Artifact compatibility metadata

Extend the existing maintainer-only pi-career artifact metadata and verification to include:

- operation-catalog schema version and digest
- complete available capability-to-operation mapping
- representative bundled-schema IDs and digests
- declared machine-output bounds
- representative deterministic operation outputs

The existing native target, source SHA, dirty-state, executable hash/size/mode, license, and synthetic parity checks remain mandatory.

### Phase 8 exclusions

Career Core must not add:

- the Pi `career_run` tool
- resume, vacancy, review, result, or variant handles
- session state or result registries
- compact model-facing presentation policy
- UI, selection dialogs, PDF extraction, PDF rendering, or file export
- source/result persistence
- model/provider calls, prompts, credentials, networking, telemetry, or retries
- generated-prose repair, automatic acceptance, or factuality upgrades
- acceptance of assisted variants by authoritative analysis or matching
- N-API, MCP, or another protocol solely for this migration
- npm/PATH/npx runtime fallback or publication

Existing Core algorithms and successful v1 operation outputs remain byte-equivalent.

### Phase 8 documentation

The Career Core change should update:

- `.agents/current-phase.md`
- `.agents/phases.md`
- `.agents/agent-integration.md`
- `docs/agent-usage.md`
- `docs/cli.md`
- `docs/distribution.md`
- `README.md`

Raw generic agents remain discovery-first. A reviewed managed adapter may perform and cache discovery internally so the model does not need model-visible capability or schema calls.

### Phase 8 acceptance criteria

1. Every existing successful operation output remains byte-equivalent.
2. Every available capability maps to exactly one callable operation descriptor.
3. Every input-taking operation identifies its exact input/output schemas and byte bounds.
4. Every bundled schema resolves offline with no unresolved or remote reference.
5. Catalogs and schema bundles are deterministic and independently validated.
6. Machine-output bounds are documented, enforced, and covered at boundary conditions.
7. Installed-CLI verification passes outside the source checkout.
8. Native artifact metadata proves the new adapter contracts and representative results.
9. Swift behavior remains unchanged unless separately justified and authorized.
10. No provider, network, persistence, UI, filesystem-domain, or model behavior enters Core.

## Pi-career managed adapter phase

After reviewed Phase 8 artifacts are available, pi-career should revise the current exact-three-tool invariant and introduce one primary compact `career_run` tool. The existing `career_core_discover`, `career_core_resume`, and `career_core_job` tools may remain available as inactive advanced/debugging compatibility tools rather than occupying normal model context.

### Ephemeral handles

The extension should maintain bounded in-memory references such as:

```text
resume:master
vacancy:current
review:abc123
result:def456
variant:ghi789
```

The model sends handles. Pi-career resolves selected local originals and current vacancy state, constructs exact Core envelopes, and reuses the exact cached review input for materialization. Complete private payloads and Core results are not persisted by default; deterministic operations are rerun after restart when necessary.

Handles must not weaken the existing persistence decision or provider-consent boundary. The model still needs source content when generating changes, but unchanged source should not be duplicated through every later Core tool argument and result.

### Internal discovery and routing

Pi-career should discover the operation catalog and required schema bundles once per verified Core version, validate compatibility, and cache only non-sensitive metadata. Normal `career_run` calls should never require the model to export schemas or manually encode nested `input_json` strings.

### Compact results and hydration

Common results should include only the decision surface needed for the next action while preserving every mandatory warning and relevant evidence, uncertainty, authority, discard, and limitation field. A stable ephemeral result handle should support bounded detail requests for checks, evidence, findings, reviewed changes, or complete raw JSON.

The complete Core result must be captured before projection, remain unchanged, and be recoverable in the current process. It must never be partially consumed after truncation. Resume/job payloads and full results must not be written to temp files without a separately approved design.

### Native review and explicit selection

Add bounded custom rendering for:

- before/proposed-after changes
- evidence and source targets
- confirmed/provisional status
- warnings and factuality limitations
- discard codes

A bounded multi-select interaction should let the user explicitly choose canonical Core change IDs. The model must not select automatically. Materialization must reuse the exact complete reviewed proposal and apply only the user's selected canonical IDs.

### Approved save workflow

A later explicitly authorized save action should require:

1. exact destination and file preview
2. explicit user confirmation
3. atomic `0600` writes in a `0700` managed directory
4. collision-safe naming
5. assisted/non-authoritative sidecar metadata and content hashes
6. immutable originals and overwrite rejection
7. immediate library rescan with variants excluded from authoritative analysis/matching

Destination configuration remains suggestion-only until this phase is designed, threat-reviewed, implemented, and tested.

### Document ingestion

Before relying on PDF originals in the managed flow, extend synthetic compatibility tests to cover Chromium-generated PDFs, common embedded fonts, multi-column documents, and tagged/untagged searchable PDFs. Continue to reject encrypted, image-only, malformed, oversized, or timed-out PDFs without OCR unless OCR receives separate authorization.

### UX and context benchmarks

Add a frozen synthetic benchmark covering:

- active tool-contract tokens
- analyze, match, review, materialization, and hydration result tokens
- model turns and tool calls
- mandatory warning/evidence/uncertainty retention
- repeated private-source bytes
- malformed-envelope prevention
- TUI and RPC behavior
- cold/warm runtime performance and memory

Initial targets:

- primary active tool contract at or below 400 `o200k_base` tokens
- no model-visible schema-export step in the managed flow
- no nested `input_json`
- original source included at most once per model workflow unless explicitly requested again
- common result at or below roughly 1,500 tokens
- complete authoritative detail recoverable on demand
- review → explicit selection → materialization without rebuilding the Core envelope

## Boundaries retained from the current package

Do not copy Pi Fallow's runtime fallback policy. Pi-career should retain:

- verified package-owned native runtime artifacts
- fail-closed supported-target selection
- no PATH, Cargo, sibling-checkout, npx, install-time download, or lifecycle build fallback
- no implicit network or provider behavior
- no automatic repair or retry of rejected external proposals
- no uncertainty, evidence, recommendation, or factuality upgrades
- no unapproved private full-result temp files
- no automatic source mutation or original overwrite

The desired parity with Pi Fallow is the compact tool, orchestration, rendering, navigation, compatibility, cancellation, and benchmark discipline—not a relaxation of Career Core's deterministic or pi-career's privacy and supply-chain boundaries.
