# Product flow roadmap

## Current phase: deterministic tools and slash-command MVP

This package preserves the three stable native tools:

- `career_core_discover`
- `career_core_resume`
- `career_core_job`

It also registers:

- `/career-setup` for library and privacy onboarding—not external CLI installation
- `/career-library` for explicitly configured searchable PDF, Markdown, and text resume roots, with actionable extraction notices
- `/career-application` for session-scoped company/role identity and vacancy/result isolation
- `/career-vacancy` for bounded vacancy input after session-persistence consent
- `/career-match` for deterministic multi-resume matching and conservative ranking
- `/career-analyze` for deterministic single-resume readiness detail
- `/career-workbench` for a bounded, visibly reviewable handoff to the user's normal Pi editor

On supported targets the three native tools plus `/career-vacancy`, `/career-match`, and `/career-analyze` invoke the package-owned Career Core runtime. Setup/library scanning remains local. `/career-application` manages consented session state only. `/career-workbench` does not invoke Core or a provider/model itself: it prepares an ordinary editor message containing one original resume and, only for tailoring, the current vacancy. The user must review and submit that message separately through Pi.

Binding boundaries:

- no provider/model calls in package commands; the workbench stops at a reviewable editor prompt
- agent-directory-relative non-sensitive config only
- no resume or vacancy text in global config
- session entries only after explicit persistence consent; entries persist to JSONL even when excluded from model context
- one company/role per Pi session; application IDs scope vacancy/result state and `/new` prevents prior company prompts from remaining in the next application conversation
- original resumes only for deterministic analyze/match
- assisted variants remain labeled and excluded from authoritative reranking
- stable path/id tie-breaking; any close-cluster label is a UI heuristic, not a Core result
- cancellation aborts the active child and stops remaining batch work
- searchable PDF text extraction is local and isolated with fixed byte/page/time/memory/result ceilings; OCR and document rewriting remain out of scope
- workbench prompts keep originals immutable, omit absolute source paths, treat document text as untrusted data, and require Career Core review of external suggestions/replacements
- PDF workbench output is suggestion-only because extracted text cannot expose or preserve visual layout; Markdown/text prompts require existing structure and unchanged wording to remain intact
- no full-result export unless a separate bounded local-file workflow is designed and tested

The approved workflow specification fixes command behavior, persistence format, non-TUI behavior, bounded UI, and cancellation ownership. Print/JSON modes fail closed except for the pure `/career-vacancy clear` state action. Company/role isolation and future opt-in artifact persistence follow the separate [`application-workspaces.md`](application-workspaces.md) contract.

## Assisted handoff and later materialization

The current workbench prepares private context in Pi's editor only. It does not call a model, hide the source payload, or write a document. Submitting is the user's separate provider action. The prompt directs the selected Pi agent to discover exact schemas, keep deterministic baselines separate, and pass external suggestions/replacements through Career Core review before presenting them.

Automatic variant saving remains deferred. A future phase may validate one bounded schema-driven proposal through Career Core review/materialization and save a new immutable assisted file only after explicit user selection. It must not add provider fallback, automatic repair/retry, overwrite originals, auto-apply changes, or feed assisted output back into authoritative analysis/matching.

## Non-goals in this phase

- package-initiated provider/model calls or full-screen UI
- DOCX/OCR/URL ingestion; image-only PDFs require external OCR or export
- model/provider integration
- source-document or full-Core-result persistence outside the approved config/custom-entry workflow
- source document mutation
- career-document publication/export, release-asset downloads, signing, or notarization
- expanded runtime platform claims beyond `darwin-arm64` and `linux-x64-gnu`
