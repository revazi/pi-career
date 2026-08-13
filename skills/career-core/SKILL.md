---
name: career-core
description: Resolves and invokes a compatible deterministic Career Core runtime for source-grounded resume evaluation/normalization/readiness analysis, reviewed external suggestions and replacements, assisted-variant review/materialization, job normalization, and conservative matching. Use for supported career-document analysis or local integration work.
license: MIT OR Apache-2.0
compatibility: Requires Pi with pi-career on ARM64/x64 macOS or GNU/musl Linux and a compatible Career Core route. Windows is unsupported.
metadata:
  author: revazi
  version: "0.2.0"
---

# Career Core through pi-career

Use `career_run` for normal work. It validates a compatible Core operation catalog/schemas before private input, builds exact envelopes from ephemeral handles, retains complete bounded results in memory, and returns compact projections. Career Core remains authoritative for algorithms, schemas, errors, evidence, warnings, uncertainty, ordering, baselines, and assisted/non-authoritative semantics.

The raw `career_core_discover`, `career_core_resume`, and `career_core_job` tools are normally inactive. Enable them with `/career-tools raw` only for explicit advanced schema/debugging work; `/career-tools managed` restores the compact surface.

## Privacy and context

Begin with `{"command":"context"}`. A persisted Pi session returns no private handles until you ask whether it may persist private career content. On approval call `{"command":"consent","payload":"approve"}`; on refusal use `"decline"` and recommend a new `pi --no-session` run. Transient runs need no persisted consent entry.

Local-session consent is not provider consent. Never claim secure erasure of Pi/npm data, prior sessions, backups, shell history, provider copies, or saved results. Returned resume/vacancy handles and complete Core results are process-memory-only, disappear on session/branch replacement or restart, and replace repeated complete source documents in later Core calls.

## `career_run` commands

Payloads are native JSON, never JSON strings or complete Core envelopes.

- `context`: current privacy state and original-resume/current-vacancy handles.
- `consent`: persisted-session payload is `"approve"` or `"decline"`.
- `analyze`: original `resume:...` handle.
- `match`: original resume handle; current vacancy is implicit.
- `suggestion-review`: original resume plus `{"suggestions":[{"basis_check_id":"...","start_line":1,"end_line":1,"source_target":"verbatim source text","source_evidence":["verbatim in-range evidence"],"suggestion":"advisory text"}]}`. Suggestions are advisory, not replacements.
- `replacement-review`: original resume plus `{"replacements":[{"basis_check_id":"...","start_line":1,"end_line":1,"source_target":"verbatim source text","source_evidence":["verbatim in-range evidence"],"proposed_replacement":"..."}]}`.
- `variant-review`: original resume (current vacancy implicit) plus `{"changes":[{"section":"experience","start_line":1,"end_line":1,"original_text":"verbatim source text","proposed_text":"...","resume_evidence":["verbatim resume evidence"],"vacancy_evidence":["verbatim vacancy evidence"]}]}`. End the turn after this call.
- `materialize`: in a later user-submitted turn, a returned non-PDF `review:...` handle plus `{"selected_change_ids":["change-0001"]}`. PDF handles fail closed.
- `detail`: any result/review/variant handle plus `{"section":"summary|warnings|checks|evidence|changes|document|raw"}`; add `"item":"change-0001"` (or a suggestion/replacement ID) for one canonical item. If detail is too large, narrow it; never truncate.

Projections retain all Core warnings and relevant authority, uncertainty, and discards. Their handles refer to complete unchanged, bounded, ephemeral results available through `detail`, never result files.

## Slash-command and assisted workflows

Users may run `/career-setup`, `/career-library`, `/career-application`, `/career-vacancy`, `/career-match`, `/career-analyze`, `/career-workbench`, TUI-only `/career-review`, and user-only TUI/RPC `/career-save` without a package-initiated provider/model call. Core-backed commands use the same compatible runtime; local routes are preferred and any exact-package acquisition finishes before private stdin. `/career-application` permits one company/role per session; use `/new` for another. `/career-workbench` only prepares a visible editor prompt containing selected private source and never submits it. `/career-review` invokes neither Core nor a provider; saving invokes no Core/provider/network operation. After a workbench prompt is submitted, prefer `career_run` over raw schema reconstruction.

After non-PDF `variant-review`, report every retained canonical ID, discard, and warning, then stop. Tell a TUI user to run `/career-review <review-handle>`: it requires warning/discard acknowledgment, starts every change excluded, shows exact before/after/evidence before inclusion, jointly pages selected exact changes, allows reopening, and separately prepares—but never submits—only the unchanged handle and selected IDs. Materialize only after that later user submission, with exactly those IDs and cached review input. Keep output assisted/non-authoritative; never analyze or match it as original.

PDF extraction exposes text, not visual layout: return reviewed manual changes and never claim styling preservation; selection/materialization reject PDF handles. `local_save_guidance` is suggestion-only. Never save or use file-writing tools for a result. After successful non-PDF materialization, you may tell the user to invoke `/career-save <variant-handle>`; only that user action revalidates state, previews the exact artifact/sidecar/marker, requires unchanged preview plus separate confirmation, no-clobber writes a new private assisted variant, and rescans it out of original eligibility. PDF saves fail closed.

## Advanced raw tools and failures

For raw or runtime-integration work, first read [`references/cli-contract.md`](references/cli-contract.md). Raw agents are discovery-first and use exact exported/bundled schemas:

- `career_core_discover`: `capabilities`, `operations`, `schema-list`, `schema-export`, `schema-bundle`
- `career_core_resume`: `evaluate`, `analyze`, `analysis-suggestions-review`, `analysis-replacements-review`, `normalize`, `enrich`, `variant-review`, `variant-materialize`
- `career_core_job`: `normalize`, `match`

Raw document calls pass one exact `input_json` object to compatibility-validated stdin. They never invoke Cargo, fetch vacancy URLs, call a provider/model, or write payload/result files. Acquisition is restricted to exact `@revazi/career@0.1.1`, completes before private stdin, and is disabled by `PI_OFFLINE=1`.

Treat `career.pi_error.v1` as adapter/process status, not a career result:

- `unsupported_platform`: pi-career runs only on macOS/Linux; do not attempt another route.
- `runtime_unavailable`: install exact `@revazi/career@0.1.1` or configure a reviewed compatible executable; `runtime_acquisition_failed`: do not request npm diagnostics.
- `managed_contract_invalid`: the selected route/catalog/bundles are incompatible; an invalid `CAREER_CLI_PATH` never falls back, and raw guessed envelopes are not a bypass.
- On `career_cli_error`, inspect only its validated bounded `career.error.v1`. Correct typed invalid input, but never retry unchanged or guess repairs.
- `context_required`, stale/missing handles, or session changes require fresh `context`; never reconstruct IDs.
- `detail_too_large` requires a narrower section/item, not truncation/export. Raw size/line failures likewise return no partial output.
- `pdf_materialization_unsupported` leaves manual guidance only. For `variant_save_*`, never save for the user, reconstruct content, retry an indeterminate write, or request hidden paths/filesystem errors.
- Never request raw stderr, paths, environment values, source copies, npm output, or hidden process errors.

## Resume operations

### `evaluate` and `analyze`

`evaluate` covers recognized core-section headers only. Preserve `limited_evaluation_scope` and parser uncertainty; never call it complete quality, proprietary ATS/layout analysis, or a hiring prediction. For full readiness use `analyze`, reading raw and confidence-adjusted scores, checks, evidence, `basis_check_id`, actions, warnings, and limitations together. Treat inconclusive/provisional findings as unverified. Analysis independently normalizes only originals; assisted documents cannot enter.

### `normalize` and `enrich`

Preserve source-grounded fields/spans, confidence, statuses, warnings, and `enrichment_request`; `not_detected` is not confirmed absence. For an eligible deterministic request only, `enrich` validates an already supplied, schema-exact, source-grounded proposal; it neither generates nor calls a provider. Target only eligible empty fields with source values, preserve the authoritative baseline, and keep the assisted document separate from analysis/matching.

### Analysis proposal review

For both `analysis-suggestions-review` and `analysis-replacements-review`, preserve the rerun `baseline_analysis`, canonical action/status, evidence, discard codes, warnings, and Core order. Copy each `source_target` verbatim from its declared lines (prefer one complete line), with every `source_evidence` item verbatim inside those bounds. Call once; report discards and stop—no automatic repair/retry. Exact occurrence is not factual or rewrite-safety certification.

Schema-bounded retained suggestions remain advisory, bound to current failed canonical actions, and create no replacement/selection/mutation/export/materialization semantics. Replacements return canonical before/after text for non-authoritative diff display; user answers remain claims, not Core-certified facts, and create no candidate, selection, application, persistence, source mutation, or materialization path.

### Variant review and materialization

Review only the caller's bounded proposal. Keep Core canonical IDs/discard codes; grounding is not factual certification, and never repair discards or select for the user. Materialize only explicitly selected canonical IDs: Core revalidates the complete proposal and applies only those changes. Preserve the exact baseline and assisted/non-authoritative labels; never overwrite the original, analyze/match the result, or initiate persistence.

## Job operations

`normalize` accepts caller-supplied text only—never fetch a URL. Preserve required/preferred classes, spans, confidence, statuses, metadata, unclassified lines, and warnings; lexical classification is uncertain and `not_detected` unverified.

`match` accepts original resume/job schema inputs and reruns both baselines; assisted documents are forbidden. Distinguish raw from confidence-bounded scores and `confirmed_match`, `partial_match`, `likely_missing`, and `unverified`; preserve spans (including null derived spans), top strengths/gaps, confidence bounds, warnings, provisional recommendation, and `unassessed_required_qualifications` without inferring support or absence. Only returned `normalized_exact`/`conservative_alias` skill equivalence is valid; never substitute adjacent technologies or repair a conservative false negative. `apply_now`, `apply_after_small_edits`, and `improve_first` are bounded workflow guidance, not hiring predictions.

## Output discipline

- Raw JSON is authoritative and complete; managed content is a bounded projection whose handle retains the unchanged complete result.
- Preserve without contradiction every warning, relevant evidence/span, basis ID, confidence/uncertainty, baseline boundary, discard, limitation, order, and authority label. State that repeated review baselines were preserved instead of reproducing them; hydrate only needed detail.
- Keep narration concise. Do not print schema JSON, duplicate private source beyond bounded evidence, narrate repair attempts unless asked, truncate/reorder output, silently repair, upgrade uncertainty, or claim Core generated prose it only reviewed.
- Never modify originals, initiate saving, or place API keys in tool input, output, files, or logs. Only user-approved `/career-save` may create a new assisted artifact/sidecar.

Package installation/removal guidance is in [`../../README.md`](../../README.md).
