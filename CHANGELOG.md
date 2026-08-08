# Changelog

## Unreleased

### Added

- Local searchable-PDF résumé ingestion through a bounded, network-disabled worker, with explicit library notices for encrypted, image-only, malformed, oversized, or otherwise unextractable PDFs.
- `/career-workbench` prepares a bounded, visibly reviewable ordinary Pi editor prompt for complete score explanation, reviewed improvement suggestions, a question-led factual interview before reviewed replacements, direct reviewed exact replacements, or vacancy-specific variant review while keeping originals immutable and stopping before any provider/model call. Non-PDF materialization requires explicit canonical change-ID selection in a later turn; PDFs stop at manual targeted changes.
- `/career-application` adds branch-aware company/role/status identity, scopes vacancies and result cards by immutable application ID, and names otherwise unnamed Pi sessions without creating workspace files.
- `/career-analyze` and `/career-match` expose complete successful Core results plus focused sections through a transient read-only pager, without storing or exporting full result JSON.
- `/career-setup` records or derives a suggestion-only preferred resume-variation directory. Workbench prompts recommend that privacy-reduced destination first after a separate user request, while creating no directory or file and granting no automatic write authority.

### Changed

- Setup and library flows now rescan immediately, display indexed PDFs and actionable scan notices, and explain the searchable PDF/Markdown/text success path instead of silently showing an empty library.
- Streamlined post-release documentation, added npm/CI/license badges, and recorded immutable `v0.1.0` package coordinates.
- Workbench review prompts now require verbatim preferably single-line source targets, avoid automatic discard-repair retries, reuse unchanged discovery/schema results, and keep prose concise instead of repeating complete review-embedded baselines.

## 0.1.0 - 2026-08-06

### Added

- Standalone Pi package with the stable `career_core_discover`, `career_core_resume`, and `career_core_job` tools.
- Self-contained reviewed unsigned and not-notarized native Career Core runtimes for `darwin-arm64` and `linux-x64-gnu`, pinned to Core commit `a3cdb4c6d7f966397e93ea4664071975bca7228c` with manifest/provenance/hash/size/mode/contract verification and fail-closed target selection.
- Bundled discovery-led `career-core` Agent Skill with no separate CLI prerequisite or stale oversized-result fallback.
- Reproducible checked-in TypeScript bundle, strict runtime/package-content verification, offline no-model and real bundled-operation smokes, isolated Pi install acceptance, and optional bundled-runtime fixture compatibility.
- Native CI execution for every claimed target without a separate Core checkout or provider credentials.
- Deterministic `/career-setup`, `/career-library`, `/career-vacancy`, `/career-match`, and `/career-analyze` workflows with bounded symlink-free text libraries, branch-aware consented session cards, conservative ranking, cancellation ownership, and RPC/TUI support without provider/model calls.
- Public-repository author, ownership, issue-form, private vulnerability-reporting, Dependabot, and pull-request hygiene.
- Synthetic process-boundary coverage adapted from Career Core commit `100774ed8bb3b39c019d64ce105af1e3f209144f`.
- Public `pi-career@0.1.0` npm package, unsigned annotated `v0.1.0` Git tag, and GitHub Release channel with no crate publication or custom release asset; exact version/full-commit installation remains canonical.
- Exact locked normal/build `career-cli` dependency evidence for both native targets, selected third-party MIT/copyright payloads, Rust 1.97.1 Standard Library evidence, target dynamic imports, the required Unicode License V3 text, deterministic package checks, and documented sole-maintainer `v0.1.0` sign-off with no independent legal-review claim.
- Strict production and complete development/host-Pi audit gates, both clean at the explicit low threshold, with bounded duplicate-key-rejecting JSON, trusted-tool enforcement, tool-shadowing tests, and npm environment override sanitization.

### Changed

- Strict package checks enforce exact public npm registry/access metadata, reject optional or bundled runtime dependency declarations, allow only approved documents, verify the extracted native license inventory, prove no Pi package contents or `node_modules`, enforce exactly four wildcard external peers, and run extracted load/runtime/install smokes.
- Pi development packages are updated to `0.84.0` (`typebox` `1.3.7`), retiring the temporary nonzero audit acceptance. `audit:production` and `audit:full` now both gate from low severity and invoke npm from the real Node installation rather than `PATH`; `check:publish` is a direct Node, no-publication readiness orchestrator combining both clean audits with strict package proof. npm tree/severity environment overrides are removed, duplicate decoded JSON keys are rejected, and package extraction uses verified absolute `/usr/bin/tar`.
