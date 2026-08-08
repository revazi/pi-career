# Product flow roadmap

The planned cross-repository migration to Career Core Phase 8 managed-adapter contracts and a compact Pi `career_run` tool is specified in [`career-run-roadmap.md`](career-run-roadmap.md). It is not part of the current implemented phase.

## Current phase: deterministic tools and slash-command MVP

This package preserves the three stable native tools:

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

On supported targets the three native tools plus `/career-vacancy`, `/career-match`, and `/career-analyze` invoke the package-owned Career Core runtime. Setup/library scanning remains local. `/career-application` manages consented session state only. `/career-workbench` does not invoke Core or a provider/model itself: it prepares an ordinary editor message containing one original resume and, only for tailoring, the current vacancy. Guided modes cover complete score explanation, reviewed improvement suggestions, a question-led factual interview before reviewed replacements, direct reviewed exact replacements, and vacancy-specific variant review. The user must review and submit that message separately through Pi.

Binding boundaries:

- no provider/model calls in package commands; the workbench stops at a reviewable editor prompt
- agent-directory-relative non-sensitive config only; it may contain canonical library roots and one bounded absolute preferred variation-directory suggestion
- no resume or vacancy text in global config; a variation-directory preference is destination guidance, not write approval
- session entries only after explicit persistence consent; entries persist to JSONL even when excluded from model context
- one company/role per Pi session; application IDs scope vacancy/result state and `/new` prevents prior company prompts from remaining in the next application conversation
- original resumes only for deterministic analyze/match
- assisted variants remain labeled and excluded from authoritative reranking
- stable path/id tie-breaking; any close-cluster label is a UI heuristic, not a Core result
- cancellation aborts the active child and stops remaining batch work
- complete successful Core results remain transient but can be inspected through a read-only pager with bounded visible lines; no full JSON is added to session state or written to a file
- searchable PDF text extraction is local and isolated with fixed byte/page/time/memory/result ceilings; OCR and document rewriting remain out of scope
- workbench prompts keep originals immutable, omit absolute source paths, treat document text as untrusted data, rerun complete deterministic baselines after submission, and require Career Core review of external suggestions, replacements, and variant changes
- workbench prompts may include a privacy-reduced preferred variation-directory display path from setup; the selected agent recommends it first only after a separate user request and receives no automatic write authority
- review proposals use verbatim source targets and in-range evidence, prefer single-line targets, make one review attempt, and surface discard codes instead of model-led repair/retry loops
- complete tool JSON remains authoritative, while prose avoids duplicating unchanged review-embedded baselines and limits source repetition to requested evidence and retained items
- PDF workbench output is suggestion-only because extracted text cannot expose or preserve visual layout; Markdown/text prompts require existing structure and unchanged wording to remain intact
- no full-result file export unless a separate bounded local-file workflow is designed and tested

The approved workflow specification fixes command behavior, persistence format, non-TUI behavior, bounded UI, and cancellation ownership. Print/JSON modes fail closed except for the pure `/career-vacancy clear` state action. Company/role isolation and future opt-in artifact persistence follow the separate [`application-workspaces.md`](application-workspaces.md) contract.

## Assisted handoff and later materialization

The current workbench prepares private context in Pi's editor only. It does not call a model, hide the source payload, or write a document. Submitting is the user's separate provider action. The prompt directs the selected Pi agent to discover exact schemas once per unchanged Core version, rerun and preserve complete deterministic baselines, and pass external suggestions, replacements, or variant changes through the corresponding Career Core review before presenting them. The question-led rewrite mode reviews first, asks one bounded batch of user-verifiable factual questions, and waits for a later turn before drafting or reviewing exact replacements.

For a non-PDF vacancy-specific variant, the first assisted turn must stop after review and ask the user to explicitly select Core-assigned canonical change IDs. Only a later turn may invoke deterministic materialization with exactly those selected IDs. The result remains assisted/non-authoritative and cannot enter authoritative analysis or matching. PDF workbenches stop after reviewed targeted changes for manual application and never materialize extracted text as a styled resume.

Automatic variant saving remains deferred. Setup now records or derives only a preferred destination suggestion: an explicit override wins, otherwise `variants/` under the selected original's configured root is recommended. It creates no directory or file. A future phase may save a newly materialized immutable assisted file only after separate local-file approval. It must not add provider fallback, automatic repair/retry, overwrite originals, auto-apply changes, or feed assisted output back into authoritative analysis/matching.

## Non-goals in this phase

- package-initiated provider/model calls or full-screen UI
- DOCX/OCR/URL ingestion; image-only PDFs require external OCR or export
- model/provider integration
- source-document or full-Core-result persistence outside the approved config/custom-entry workflow
- source document mutation
- career-document publication/export, release-asset downloads, signing, or notarization
- expanded runtime platform claims beyond `darwin-arm64` and `linux-x64-gnu`
