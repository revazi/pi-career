---
name: career-core
description: Discovers and invokes the package-owned deterministic Career Core runtime for source-grounded resume evaluation/normalization/readiness analysis, reviewed external suggestions and replacements, assisted-variant review/materialization, job normalization, and conservative matching. Use for supported career-document analysis or local integration work.
license: MIT OR Apache-2.0
compatibility: Requires Pi with pi-career on supported darwin-arm64 or linux-x64-gnu; CAREER_CLI_PATH is an optional bounded developer/recovery override.
metadata:
  author: revazi
  version: "0.1.0"
---

# Career Core through pi-career

Use the package-owned Career Core runtime through the three native tools. Career Core is authoritative; the extension only transports bounded argv/stdin JSON. Never recreate scoring, schemas, errors, evidence rules, uncertainty, or repair behavior in prompts or TypeScript.

## Privacy decision before document use

Pi may persist tool arguments and results in session JSONL even though Career Core and this extension do not persist career documents. Before putting private resume or job content in `career_core_resume` or `career_core_job`, require the user to make an explicit Pi session-persistence decision. Recommend starting a new transient run:

```bash
pi --no-session
```

Do not claim secure erasure or removal of previous sessions, backups, shell history, provider copies, or separately saved results. If the user does not approve private content in Pi context, do not call a document tool. Local-session approval is not approval to send content to an external model/provider.

## Discover first

1. Call `career_core_discover` with `operation: "capabilities"`.
2. Invoke only capabilities whose status is `available`; never treat planned entries as callable.
3. Call `career_core_discover` with `operation: "schema-list"`.
4. Export the exact input schema needed with `operation: "schema-export"` and its returned schema ID.
5. Construct exactly one versioned input object matching that schema, serialize it as the `input_json` string, and call the relevant document tool.

Do not infer input shapes from this prose. The bundled runtime embeds the reviewed Draft 2020-12 schemas and discovery performs no network request.

## Deterministic slash commands

On supported targets, users can run `/career-setup`, `/career-library`, `/career-application`, `/career-vacancy`, `/career-match`, and `/career-analyze` without involving a provider/model. `/career-vacancy`, `/career-match`, and `/career-analyze` invoke the same package-owned runtime directly rather than calling the native tools through the LLM; setup/library scanning remains local. `/career-application` manages branch-aware company/role identity and scopes subsequent vacancy/result entries without creating files. Keep one application per Pi session and use `/new` before another company/role so prior private prompts do not remain in the next conversation. The document commands scan only configured searchable PDF/Markdown/text roots, keep assisted variants and inputs over 50,000 Unicode scalar values out of authoritative analysis/matching, require persisted-session consent before private custom entries, and never store full Core JSON.

`/career-workbench` is a separate, reviewable handoff. It places the complete selected private source in Pi's editor and never submits or invokes a provider automatically. When the user submits that ordinary message, follow its immutable-original and format-fidelity rules: PDF input is extracted text only, so provide targeted changes for manual application and never claim to inspect or preserve PDF layout; preserve Markdown/text structure and unchanged wording. Discover exact schemas and pass external suggestions/replacements through Career Core review before presenting them.

Use the native tool flow below for operations not exposed by those commands or when the user explicitly requests direct schema-level work.

## Native tool surface

- `career_core_discover`
  - `capabilities`
  - `schema-list`
  - `schema-export` (requires exact `schema_id` from the list)
- `career_core_resume`
  - `evaluate`
  - `analyze`
  - `analysis-suggestions-review`
  - `analysis-replacements-review`
  - `normalize`
  - `enrich`
  - `variant-review`
  - `variant-materialize`
- `career_core_job`
  - `normalize`
  - `match`

The document tools send `input_json` only to package-owned runtime stdin with `--input - --format json-compact`. They never search PATH, invoke Cargo, fetch URLs, call a provider/model, or write payload/result files. Successful tool text is the complete runtime JSON without semantic transformation.

## Failure handling

A `career.pi_error.v1` value is adapter/process status, not a deterministic career result.

- `unsupported_platform` means no reviewed bundled runtime exists for this platform/libc; do not guess, download, or fall back to PATH/Cargo.
- `bundled_runtime_invalid` means local integrity verification failed; do not request paths, hashes, environment values, or raw filesystem errors.
- On `career_cli_error`, inspect only the nested, validated, bounded `career.error.v1`.
- Correct typed invalid input before trying again; do not repair by guesswork or retry unchanged validation failures.
- On `result_too_large` or `result_too_many_lines`, do not request or use partial output. Full-result export is not yet available through pi-career.
- Do not ask for raw stderr, paths, environment values, source copies, or hidden process errors.

## Resume operation rules

### `evaluate`

This is recognized core-section header coverage only. Preserve `limited_evaluation_scope` and parser uncertainty. Never present it as complete resume quality, proprietary ATS compatibility, visual-layout inspection, or a hiring prediction. Use `analyze` for full deterministic readiness analysis.

### `analyze`

Read `raw_score`, confidence-adjusted `score`, checks, evidence, `basis_check_id`, actions, warnings, and limitations together. Treat `inconclusive` checks and `provisional` findings as unverified. It independently scores only deterministic normalization of the original input; assisted documents cannot enter.

### `normalize`

Preserve source-grounded fields, source spans, confidence, statuses, warnings, and `enrichment_request`. `not_detected` is not confirmed absence.

### `enrich`

This validates an explicit, already supplied source-grounded external proposal; it does not generate one or call a provider. Use only when the deterministic request is eligible and the proposal exactly matches the exported schema. Values must come from source text and target only eligible empty fields. Preserve the unchanged authoritative `baseline`; keep `assisted_document` separate and never feed it into authoritative analysis or matching.

### `analysis-suggestions-review`

This reruns and preserves the deterministic `baseline_analysis` while reviewing at most the schema-bounded source-targeted suggestions. Retained suggestions are assisted/non-authoritative and bound to current failed canonical actions. Exact occurrence does not prove factual entailment or rewrite safety. The v1 `suggestion` is advisory text, not a replacement. Do not create selection, mutation, export, or materialization semantics.

### `analysis-replacements-review`

This reruns and preserves `baseline_analysis` and returns canonical exact before/proposed-after values for non-authoritative diff display. Preserve action/status, evidence, discard codes, and warnings. Exact occurrence does not certify factuality or rewrite safety. It creates no candidate, selection, application, export, persistence, source mutation, or materialization path.

### `variant-review`

Review only the bounded external proposal supplied by the caller. Use Core-assigned canonical retained-change IDs and discard codes. Exact evidence occurrence is structural grounding, not factual certification. Do not repair discarded changes or select changes for the user.

### `variant-materialize`

Call only after the user explicitly selects canonical IDs. Core revalidates the complete proposal and applies only selected changes. Preserve the exact baseline and assisted/non-authoritative labels. Never overwrite the original automatically or pass the assisted result to `analyze` or `job match`.

## Job operation rules

### `normalize`

Provide caller-supplied plain text only; never fetch a vacancy URL. Preserve required/preferred classifications, source spans, confidence, statuses, metadata, unclassified lines, and warnings. Lexical classification is not semantic certainty, and `not_detected` remains unverified.

### `match`

Use original resume and original job inputs matching the exported schema. Matching independently reruns both deterministic baselines and cannot consume assisted documents.

- Distinguish category `raw_score` from confidence-bounded `score`.
- Keep `confirmed_match`, `partial_match`, `likely_missing`, and `unverified` distinct.
- Cite resume/job spans when present and preserve null spans for derived signals.
- Accept only `normalized_exact` and returned `conservative_alias` skill equivalence.
- Never substitute adjacent technologies or repair a conservative false negative.
- Preserve top strengths/gaps, confidence bounds, warnings, and provisional recommendation status.
- Treat `apply_now`, `apply_after_small_edits`, and `improve_first` as bounded workflow guidance, never a hiring prediction.
- Review `unassessed_required_qualifications`; do not infer support or absence.

## Output discipline

- Treat returned JSON as authoritative and complete.
- Preserve every warning, evidence item, source span, basis ID, confidence value, uncertainty status, baseline boundary, discard code, limitation, and assisted/non-authoritative label.
- Do not reorder, truncate, silently repair, upgrade uncertainty into fact, or claim Core generated prose it only reviewed.
- Do not modify source documents unless the user separately requests and approves that change.
- Never place API keys in tool input, output, files, or logs.

See [`references/cli-contract.md`](references/cli-contract.md) for bundled-runtime selection and process details. Package installation and removal are in [`../../README.md`](../../README.md).
