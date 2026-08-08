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

Use `career_run` as the primary managed interface. It discovers the verified package-owned Career Core operation catalog and self-contained schemas internally, builds exact Core envelopes from ephemeral handles, captures complete bounded Core output in memory, and returns compact model-facing projections. Career Core remains authoritative for algorithms, schemas, errors, evidence, warnings, uncertainty, ordering, baselines, and assisted/non-authoritative semantics.

The raw `career_core_discover`, `career_core_resume`, and `career_core_job` tools remain registered but are normally inactive. Use `/career-tools raw` only for explicit advanced schema/debugging work; `/career-tools managed` returns to the compact surface.

## Privacy and managed context

Start every managed workflow with:

```json
{"command":"context"}
```

In a persisted Pi session, `context` returns no private handles until an explicit session-persistence decision exists. Ask the user first. If approved, call:

```json
{"command":"consent","payload":"approve"}
```

If declined, call consent with `"decline"` and recommend a new transient run:

```bash
pi --no-session
```

Do not claim secure erasure or removal of previous sessions, backups, shell history, provider copies, or separately saved results. Local-session approval is not provider approval. Transient sessions require no persisted consent entry.

After approval, `context` returns bounded `resume:...` handles and, when set through `/career-vacancy`, `vacancy:current`. Handles and complete Core results are process-memory-only and disappear on session/branch replacement or restart. The model sends handles instead of repeating complete source documents in later Core envelopes.

## `career_run` commands

All payloads are native JSON values, never JSON strings or complete Core envelopes.

- `context`: load current original-resume/current-vacancy handles after privacy checks.
- `consent`: payload is `"approve"` or `"decline"` in a persisted session.
- `analyze`: `handle` is an original `resume:...` handle.
- `match`: `handle` is an original resume; the current vacancy is implicit.
- `suggestion-review`: `handle` is an original resume; payload is `{"suggestions":[{"basis_check_id":"...","start_line":1,"end_line":1,"source_target":"verbatim source text","source_evidence":["verbatim in-range evidence"],"suggestion":"advisory text"}]}`. Suggestions are advisory, never replacements.
- `replacement-review`: `handle` is an original resume; payload is:

```json
{
  "replacements": [{
    "basis_check_id": "...",
    "start_line": 1,
    "end_line": 1,
    "source_target": "verbatim source text",
    "source_evidence": ["verbatim in-range evidence"],
    "proposed_replacement": "..."
  }]
}
```

- `variant-review`: `handle` is an original resume and the current vacancy is implicit; payload is:

```json
{
  "changes": [{
    "section": "experience",
    "start_line": 1,
    "end_line": 1,
    "original_text": "verbatim source text",
    "proposed_text": "...",
    "resume_evidence": ["verbatim resume evidence"],
    "vacancy_evidence": ["verbatim vacancy evidence"]
  }]
}
```

- `materialize`: `handle` is the returned variant `review:...`; only after explicit user selection, payload is `{"selected_change_ids":["change-0001"]}`.
- `detail`: `handle` is any returned result/review/variant handle; payload is `{"section":"summary|warnings|checks|evidence|changes|document|raw"}`. For one exact canonical item add `"item":"change-0001"`, `"suggestion-0001"`, or `"replacement-0001"`. Oversized model-visible detail fails rather than truncating; request a narrower section/item.

Managed projections preserve all Core warnings and the relevant authority/uncertainty/discard surface. Complete authoritative JSON remains in bounded ephemeral memory for detail access and is never written to a result file.

## Deterministic slash commands

On supported targets, users can run `/career-setup`, `/career-library`, `/career-application`, `/career-vacancy`, `/career-match`, and `/career-analyze` without involving a provider/model. `/career-vacancy`, `/career-match`, and `/career-analyze` invoke the same package-owned runtime directly. `/career-application` owns branch-aware company/role identity and keeps one application per Pi session; use `/new` before another company/role.

`/career-workbench` remains a guided, reviewable provider handoff. It places complete selected private source in Pi's editor but never submits automatically. Prefer `career_run` rather than raw schema reconstruction after the prompt is submitted.

For non-PDF variants, present canonical retained IDs and all discard codes/warnings, then stop for explicit user selection. Materialize only in a later turn with exactly those IDs and the cached exact review input. Keep the result assisted/non-authoritative and never feed it into analysis or matching. PDF input remains extracted text only: provide reviewed manual changes, do not materialize, and do not claim to preserve visual layout.

A workbench `local_save_guidance` destination is suggestion-only. Never save automatically or place assisted output under `originals/`; exact path/file approval and the assisted sidecar contract remain required. Package-owned saving is still deferred.

## Advanced raw tool surface

- `career_core_discover`: `capabilities`, `operations`, `schema-list`, `schema-export`, `schema-bundle`
- `career_core_resume`: `evaluate`, `analyze`, `analysis-suggestions-review`, `analysis-replacements-review`, `normalize`, `enrich`, `variant-review`, `variant-materialize`
- `career_core_job`: `normalize`, `match`

Raw agents remain discovery-first. Run capabilities and operations, then use exact exported/bundled schemas. Raw document tools send `input_json` only to verified package-owned runtime stdin with `--input - --format json-compact`; they never search PATH, invoke Cargo, fetch URLs, call a provider/model, or write payload/result files.

## Failure handling

A `career.pi_error.v1` value is adapter/process status, not a deterministic career result.

- `unsupported_platform` means no reviewed bundled runtime exists for this platform/libc; do not guess, download, or fall back to PATH/Cargo.
- `bundled_runtime_invalid` means local integrity verification failed; do not request paths, hashes, environment values, or raw filesystem errors.
- On `career_cli_error`, inspect only the nested, validated, bounded `career.error.v1`.
- Correct typed invalid input before trying again; do not repair by guesswork or retry unchanged validation failures.
- Raw tools may still return `result_too_large` or `result_too_many_lines`; do not request or use partial output.
- `career_run` `managed_contract_invalid` means the bundled operation catalog/schema bundles are incompatible; do not bypass discovery or fall back to raw guessed envelopes.
- `context_required`, stale/missing handles, and session changes require a fresh `context`, not reconstructed identifiers.
- `detail_too_large` requires a narrower section or exact item; it does not authorize truncation or result-file export.
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

This reruns and preserves the deterministic `baseline_analysis` while reviewing at most the schema-bounded source-targeted suggestions. Retained suggestions are assisted/non-authoritative and bound to current failed canonical actions. Copy each `source_target` verbatim from inside the declared source lines, never use a descriptive label, prefer one complete source line, and require each `source_evidence` item to occur verbatim within the same bounds. Make one review call; report discarded items and stop instead of automatically repairing or retrying them. Exact occurrence does not prove factual entailment or rewrite safety. The v1 `suggestion` is advisory text, not a replacement. Do not create selection, mutation, export, or materialization semantics.

### `analysis-replacements-review`

This reruns and preserves `baseline_analysis` and returns canonical exact before/proposed-after values for non-authoritative diff display. Copy each `source_target` verbatim from inside the declared source lines, prefer one complete source line, and keep every `source_evidence` item inside those bounds. Make one review call; report discarded items and stop instead of automatically repairing or retrying them. Preserve action/status, evidence, discard codes, and warnings. Exact occurrence does not certify factuality or rewrite safety. User answers gathered in a prior question-led turn remain user-supplied claims, not Core-certified facts. It creates no candidate, selection, application, export, persistence, source mutation, or materialization path.

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

- Raw Career Core tool JSON is authoritative and complete. `career_run` content is a bounded adapter projection; its `result:...`, `review:...`, or `variant:...` handle refers to the complete unchanged Core result held in ephemeral memory.
- Use every warning, evidence item, source span, basis ID, confidence value, uncertainty status, baseline boundary, discard code, limitation, and assisted/non-authoritative label without contradiction or silent repair.
- Do not duplicate a complete unchanged `baseline_analysis` in prose each time a review embeds it. State that the baseline was preserved; reproduce every warning, discard code, and limitation exactly; and hydrate only the scores, evidence, source spans, or canonical items needed for the request. The ephemeral complete Core result remains authoritative for the current process.
- Keep operational narration minimal. Do not print discovered schema JSON, repeat private source text beyond bounded evidence snippets, or narrate repair attempts unless the user asks.
- Do not reorder Core-retained items, truncate tool output, silently repair, upgrade uncertainty into fact, or claim Core generated prose it only reviewed.
- Do not modify source documents unless the user separately requests and approves that change.
- Never place API keys in tool input, output, files, or logs.

See [`references/cli-contract.md`](references/cli-contract.md) for bundled-runtime selection and process details. Package installation and removal are in [`../../README.md`](../../README.md).
