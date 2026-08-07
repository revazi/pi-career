# Product flow roadmap

## Current phase: deterministic tools and slash-command MVP

This package preserves the three stable native tools:

- `career_core_discover`
- `career_core_resume`
- `career_core_job`

It also registers:

- `/career-setup` for library and privacy onboarding—not external CLI installation
- `/career-library` for explicitly configured searchable PDF, Markdown, and text resume roots, with actionable extraction notices
- `/career-vacancy` for bounded vacancy input after session-persistence consent
- `/career-match` for deterministic multi-resume matching and conservative ranking
- `/career-analyze` for deterministic single-resume readiness detail

On supported targets all eight routes invoke the package-owned deterministic Career Core runtime. Slash commands call the shared process helper directly and do not use a provider/model or an LLM-facing tool.

Binding boundaries:

- no provider/model calls in deterministic commands
- agent-directory-relative non-sensitive config only
- no resume or vacancy text in global config
- session entries only after explicit persistence consent; entries persist to JSONL even when excluded from model context
- original resumes only for deterministic analyze/match
- assisted variants remain labeled and excluded from authoritative reranking
- stable path/id tie-breaking; any close-cluster label is a UI heuristic, not a Core result
- cancellation aborts the active child and stops remaining batch work
- searchable PDF text extraction is local and isolated with fixed byte/page/time/memory/result ceilings; OCR and document rewriting remain out of scope
- no full-result export unless a separate bounded local-file workflow is designed and tested

The approved workflow specification fixes command behavior, persistence format, non-TUI behavior, bounded UI, and cancellation ownership. Print/JSON modes fail closed except for the pure `/career-vacancy clear` state action.

## Later phase: assisted workflows

Model-assisted tailoring or suggestion review is intentionally deferred. A future phase may use the currently selected Pi model only after separate provider consent, validate one bounded schema-driven proposal, pass it through Career Core review/materialization, and save a new immutable assisted file. It must not add provider fallback, automatic repair/retry, overwrite originals, auto-apply changes, or feed assisted output back into authoritative analysis/matching.

## Non-goals in this phase

- provider/model-assisted commands or full-screen UI
- DOCX/OCR/URL ingestion; image-only PDFs require external OCR or export
- model/provider integration
- source-document or full-Core-result persistence outside the approved config/custom-entry workflow
- source document mutation
- career-document publication/export, release-asset downloads, signing, or notarization
- expanded runtime platform claims beyond `darwin-arm64` and `linux-x64-gnu`
