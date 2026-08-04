# Product flow roadmap

## Current phase: deterministic runtime tools

This package currently exposes only the three stable native tools:

- `career_core_discover`
- `career_core_resume`
- `career_core_job`

On supported targets, they invoke the package-owned deterministic Career Core runtime. This phase adds no slash commands, custom UI, document library, extension persistence, model/provider call, or network behavior. The Agent Skill remains the expert/manual workflow.

## Next phase: deterministic slash-command MVP

A separately reviewed phase may add:

- `/career-setup` for library and privacy onboarding—not external CLI installation
- `/career-library` for explicitly configured Markdown/text resume roots
- `/career-vacancy` for bounded vacancy input after session-persistence consent
- `/career-match` for deterministic multi-resume matching and conservative ranking
- `/career-analyze` for deterministic single-resume readiness detail

Binding boundaries for that phase:

- no provider/model calls in deterministic commands
- agent-directory-relative non-sensitive config only
- no resume or vacancy text in global config
- session entries only after explicit persistence consent; entries persist to JSONL even when excluded from model context
- original resumes only for deterministic analyze/match
- assisted variants remain labeled and excluded from authoritative reranking
- stable path/id tie-breaking; any close-cluster label is a UI heuristic, not a Core result
- cancellation aborts the active child and stops remaining batch work
- no full-result export unless a separate bounded local-file workflow is designed and tested

The exact command behavior, persistence format, non-TUI behavior, and UI accessibility require a dedicated implementation review before code is added.

## Later phase: assisted workflows

Model-assisted tailoring or suggestion review is intentionally deferred. A future phase may use the currently selected Pi model only after separate provider consent, validate one bounded schema-driven proposal, pass it through Career Core review/materialization, and save a new immutable assisted file. It must not add provider fallback, automatic repair/retry, overwrite originals, auto-apply changes, or feed assisted output back into authoritative analysis/matching.

## Non-goals in this phase

- command or TUI implementation
- PDF/DOCX/OCR/URL ingestion
- model/provider integration
- document/session/config persistence
- source document mutation
- publication, release downloads, signing, or notarization
- expanded runtime platform claims beyond `darwin-arm64` and `linux-x64-gnu`
