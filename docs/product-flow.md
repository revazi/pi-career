# Product flow roadmap

The cross-repository migration plan and measured findings are recorded in [`career-run-roadmap.md`](career-run-roadmap.md). Career Core Phase 8 and the first managed `career_run` implementation are complete. Synthetic PDF compatibility now covers reviewed Chromium-generated tagged/untagged and ReportLab-generated two-page documents, embedded-font and multi-column layouts, and fail-closed text-unavailable cases; package-owned saving and further PDF extraction expansion remain later phases.

## Current phase: managed agent tool and deterministic slash commands

The normal active model surface is one compact `career_run` tool. The exact raw compatibility tools remain registered but inactive until `/career-tools raw` explicitly enables them:

- `career_core_discover`
- `career_core_resume`
- `career_core_job`

It also registers:

- `/career-setup` for library/privacy onboarding and a suggestion-only preferred variation directory—not external CLI installation
- `/career-library` for explicitly configured searchable PDF, Markdown, and text resume roots, with actionable extraction notices
- `/career-application` for session-scoped company/role identity and vacancy/result isolation
- `/career-vacancy` for bounded vacancy input after session-persistence consent
- `/career-match` for deterministic multi-resume matching and conservative ranking
- `/career-analyze` for deterministic single-resume readiness detail
- `/career-workbench` for a bounded, guided, visibly reviewable rebuild handoff to the user's normal Pi editor
- `/career-review` for TUI-only, bounded inspection and explicit selection of current non-PDF retained variant changes
- `/career-tools` to switch between the managed-only and advanced raw model-tool surfaces

`career_run`, the raw compatibility tools, `/career-vacancy`, `/career-match`, and `/career-analyze` invoke the compatible Career Core route selected by the external resolver. Managed compatibility is validated before private input, and the reviewed exact package may be acquired only after local routes fail unless `PI_OFFLINE=1`. `career_run` validates Phase 8 operation/schema contracts internally, resolves current originals/vacancy through ephemeral handles, keeps complete results in bounded process memory, and exposes compact detail hydration without nested `input_json`. Setup/library scanning remains local. `/career-application` manages consented session state only. `/career-workbench` does not invoke Core or a provider/model itself: it prepares an ordinary editor message containing one original resume and, only for tailoring, the current vacancy. Guided modes cover complete score explanation, reviewed improvement suggestions, a question-led factual interview before reviewed replacements, direct reviewed exact replacements, and vacancy-specific variant review. The user must review and submit that message separately through Pi. `/career-review` also invokes neither Core nor a provider: it reads one current in-memory non-PDF variant review, requires warnings/discards acknowledgment and exact per-change inspection before inclusion, then prepares a later editor message containing only the unchanged review handle and selected canonical IDs.

Binding boundaries:

- no package-initiated provider/model calls or automatic submission; the workbench stops at a reviewable editor prompt, and only the user's later ordinary Pi submission may contact the selected provider; exact-package acquisition before private stdin is the sole network-capable adapter-runtime behavior
- agent-directory-relative non-sensitive config only; it may contain canonical library roots and one bounded absolute preferred variation-directory suggestion
- no resume or vacancy text in global config; a variation-directory preference is destination guidance, not write approval
- session entries only after explicit persistence consent; entries persist to JSONL even when excluded from model context
- one company/role per Pi session; application IDs scope vacancy/result state and `/new` prevents prior company prompts from remaining in the next application conversation
- original resumes only for deterministic analyze/match
- assisted variants remain labeled and excluded from authoritative reranking
- stable path/id tie-breaking; any close-cluster label is a UI heuristic, not a Core result
- cancellation aborts the active child and stops remaining batch work
- complete slash-command Core results remain transiently inspectable through a read-only pager; managed full results/exact review inputs remain only in a 16-entry/64-MiB ephemeral registry, and no full JSON is added to session state or written to a file
- searchable PDF text extraction is local and isolated with fixed byte/page/time/memory/result ceilings; OCR and document rewriting remain out of scope
- workbench prompts keep originals immutable, omit absolute source paths, treat document text as untrusted data, rerun complete deterministic baselines after submission, and require Career Core review of external suggestions, replacements, and variant changes
- workbench prompts may include a privacy-reduced preferred variation-directory display path from setup; the selected agent recommends it first only after a separate user request and receives no automatic write authority
- review proposals use verbatim source targets and in-range evidence, prefer single-line targets, make one review attempt, and surface discard codes instead of model-led repair/retry loops
- `career_run variant-review` terminates its turn; the TUI selector defaults every retained change to excluded, pages exact before/after/evidence locally, then pages selected changes together as compact labeled exact records, permits direct final-stage reopening of each record, and requires a separate prepare-or-back decision
- review selection is process-memory-only: only the final prepare choice puts the ephemeral review handle and selected canonical IDs in the editor; pi-career appends no selection entry and performs no Core call
- PDF review changes remain manual guidance; `/career-review` and `career_run materialize` reject PDF review handles because extracted text cannot preserve the styled document
- raw tool JSON remains authoritative; managed projections refer to complete authoritative in-memory results by handle, while prose hydrates only requested evidence and retained items
- PDF workbench output is suggestion-only because extracted text cannot expose or preserve visual layout; Markdown/text prompts require existing structure and unchanged wording to remain intact
- no full-result file export unless a separate bounded local-file workflow is designed and tested

The approved workflow specification fixes command behavior, persistence format, non-TUI behavior, bounded UI, and cancellation ownership. Print/JSON modes fail closed except for the pure `/career-vacancy clear` state action. Company/role isolation and future opt-in artifact persistence follow the separate [`application-workspaces.md`](application-workspaces.md) contract.

## Assisted handoff and later materialization

The current workbench prepares private context in Pi's editor only. It does not call a model, hide the source payload, or write a document. Submitting is the user's separate provider action. The prompt directs the selected Pi agent to start with `career_run context`, use internal exact Phase 8 contract discovery, rerun and preserve complete deterministic baselines behind ephemeral handles, and pass external suggestions, replacements, or variant changes through the corresponding Career Core review before presenting them. The question-led rewrite mode reviews first, asks one bounded batch of user-verifiable factual questions, and waits for a later turn before drafting or reviewing exact replacements.

For a non-PDF vacancy-specific variant, the first assisted turn stops mechanically after review. In TUI, the user can run `/career-review <review-handle>` to page all warnings/discards and exact retained changes. Every change starts excluded and can be included only from its exact detail view. Continuing pages all selected exact records together with compact labels and permits direct read-only reopening of each one; a separate final choice either returns to review or prepares—but never submits—the later user message with exactly the selected Core IDs and unchanged handle. Only after the user reviews and submits that message may deterministic materialization run. The result remains assisted/non-authoritative and cannot enter authoritative analysis or matching. PDF workbenches stop after reviewed targeted changes for manual application; PDF handles are rejected by selection and materialization and never turn extracted text into a styled resume.

Automatic variant saving remains deferred. Setup now records or derives only a preferred destination suggestion: an explicit override wins, otherwise `variants/` under the selected original's configured root is recommended. It creates no directory or file. A future phase may save a newly materialized immutable assisted file only after separate local-file approval. It must not add provider fallback, automatic repair/retry, overwrite originals, auto-apply changes, or feed assisted output back into authoritative analysis/matching.

## Non-goals in this phase

- package-initiated provider/model clients, credentials, automatic prompt submission, or full-screen UI
- DOCX/OCR/URL ingestion; image-only PDFs require external OCR or export
- source-document or full-Core-result persistence outside the approved config/custom-entry workflow
- source document mutation
- career-document publication/export, release-asset downloads, signing, or notarization
- package-owned native binaries or platform claims beyond the exact reviewed `@revazi/career@0.1.1` catalog
