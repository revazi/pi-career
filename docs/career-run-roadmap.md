# Managed Career Core and `career_run` roadmap

## Status

Career Core Phase 8 was merged as `f6d1783` through PR #21. The first compact `career_run` implementation, ephemeral handles, complete bounded in-memory results, detail hydration, raw-tool activation control, and synthetic token benchmark are implemented here. Runtime distribution now belongs to reviewed exact `@revazi/career@0.1.0`; pi-career packages no native artifacts and resolves compatible external routes before managed execution. Package-owned save/export, richer interactive change selection/navigation, and broader PDF extraction compatibility remain later reviewed work.

Completed sequence:

1. Career Core Phase 8 managed-adapter support.
2. Native Phase 8 artifact preparation and compatibility review.
3. Artifact import with provenance/catalog/bundle/output-bound verification.
4. Primary `career_run` implementation with raw tools inactive by default.
5. Reproducible synthetic context benchmark and budget gates.
6. External local-first resolver with exact package acquisition, pre-private-input compatibility validation, and removal of bundled native artifacts.

This document records findings and phase boundaries; it does not independently authorize persistence, publication, release, or later deferred work.

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

## Delivered initial agent experience

The primary interface is now one compact high-level Pi tool:

```text
career_run {command: context}
career_run {command: analyze, handle: resume:...}
career_run {command: match, handle: resume:...}
career_run {command: variant-review, handle: resume:..., payload: {changes: [...]}}
career_run {command: materialize, handle: review:..., payload: {selected_change_ids: [...]}}
career_run {command: detail, handle: result:..., payload: {section: evidence}}
# package-owned save remains deferred
```

This is the implemented compact v1 command shape; package-owned save remains deferred. Private document text continues to travel only through bounded stdin at the Career Core process boundary, never through CLI arguments.

Career Core remains authoritative for operations, schemas, algorithms, typed errors, evidence, warnings, uncertainty, ordering, deterministic baselines, and assisted/non-authoritative semantics. Pi-career owns handles, orchestration, projection, interaction, and explicitly approved persistence.

## Career Core Phase 8: delivered managed-adapter support

The explicitly authorized and reviewed Career Core Phase 8 added only the machine contracts needed by a managed adapter.

### Operation catalog

Phase 8 added the deterministic machine command:

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

Phase 8 added the deterministic offline command:

```text
career schema bundle --id career.resume_variant_review_input.v1
```

Bundled output recursively resolves only embedded local references, requires no source checkout or network, remains valid Draft 2020-12 JSON Schema, and is deterministic and bounded. Existing unbundled schema-export bytes remain unchanged.

This lets pi-career validate exact Core envelopes without copying Core schemas into TypeScript or exposing schema discovery to the model during normal workflows.

### Machine-output bounds

Phase 8 documents and enforces one 32-MiB maximum successful JSON output size and reports it for every operation in the catalog. The bound covers every valid bounded Core result.

Pi-career captures complete authoritative JSON within that limit, keeps it only in ephemeral memory, and exposes compact model-facing projections with explicit detail hydration. An oversized Core result is never silently truncated.

### Artifact compatibility metadata

The imported maintainer-only artifact metadata and verification now include:

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

The Career Core change updated:

- `.agents/current-phase.md`
- `.agents/phases.md`
- `.agents/agent-integration.md`
- `docs/agent-usage.md`
- `docs/cli.md`
- `docs/distribution.md`
- `README.md`

Raw generic agents remain discovery-first. A reviewed managed adapter may perform and cache discovery internally so the model does not need model-visible capability or schema calls.

### Phase 8 accepted criteria

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

Pi-career now uses one primary compact `career_run` tool. The existing `career_core_discover`, `career_core_resume`, and `career_core_job` tools remain registered as inactive advanced/debugging compatibility tools rather than occupying normal model context; `/career-tools raw` enables them explicitly.

### Ephemeral handles

The extension maintains bounded in-memory references such as:

```text
resume:<stable-prefix>
vacancy:current
review:abc123
result:def456
variant:ghi789
```

The model sends handles. Pi-career resolves selected local originals and current vacancy state, constructs exact Core envelopes, and reuses the exact cached review input for materialization. Complete private payloads and Core results are not persisted by default; deterministic operations are rerun after restart when necessary.

Handles must not weaken the existing persistence decision or provider-consent boundary. The model still needs source content when generating changes, but unchanged source should not be duplicated through every later Core tool argument and result.

### Internal discovery and routing

Pi-career discovers the operation catalog and required schema bundles for the selected compatible Core route, validates compatibility before private input, and caches only non-sensitive metadata. Normal `career_run` calls never require the model to export schemas or manually encode nested `input_json` strings.

### Compact results and hydration

Common results include only the decision surface needed for the next action while preserving every mandatory warning and relevant evidence, uncertainty, authority, discard, and limitation field. A stable ephemeral result handle supports bounded detail requests for checks, evidence, reviewed changes, document text, or complete raw JSON.

The complete Core result must be captured before projection, remain unchanged, and be recoverable in the current process. It must never be partially consumed after truncation. Resume/job payloads and full results must not be written to temp files without a separately approved design.

### Deferred richer review rendering and selection

A later reviewed phase may add bounded custom rendering for:

- before/proposed-after changes
- evidence and source targets
- confirmed/provisional status
- warnings and factuality limitations
- discard codes

The initial managed adapter already requires explicit canonical change IDs and reuses the exact complete reviewed proposal for materialization; the model must not select automatically. A later bounded multi-select interaction may make that user decision easier without changing the authority boundary.

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

To broaden confidence beyond the current searchable-PDF fixtures, extend synthetic compatibility tests to cover Chromium-generated PDFs, common embedded fonts, multi-column documents, and tagged/untagged searchable PDFs. Continue to reject encrypted, image-only, malformed, oversized, or timed-out PDFs without OCR unless OCR receives separate authorization.

### UX and context benchmarks

The initial frozen synthetic benchmark covers the active/raw tool contracts, representative analyze and variant-review results, and the existing workbench prompt. Later benchmark expansion should cover:

- match, suggestion/replacement-review, materialization, and hydration result tokens
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

## Runtime boundaries retained after externalization

Pi-career retains:

- no packaged native runtime artifacts or runtime dependencies
- fixed resolution through explicit `CAREER_CLI_PATH`, PATH `career`, package-local exact `@revazi/career`, then acquisition of exact `@revazi/career@0.1.0`
- no Cargo, sibling checkout, source build, arbitrary executable download, unpinned package, or lifecycle fallback
- `PI_OFFLINE=1` disables acquisition; the only implicit network-capable behavior is bounded exact-package acquisition after local routes fail and before private stdin opens
- exact managed compatibility for caller-controlled routes and native integrity delegated to the reviewed package launcher
- no automatic repair or retry of rejected external proposals
- no uncertainty, evidence, recommendation, or factuality upgrades
- no unapproved private full-result temp files
- no automatic source mutation or original overwrite

The desired parity with Pi Fallow is the compact tool, orchestration, rendering, navigation, compatibility, cancellation, and benchmark discipline—not a relaxation of Career Core's deterministic or pi-career's privacy and supply-chain boundaries.
