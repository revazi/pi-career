# Changelog

## Unreleased

### Changed

- Added mocked release-automation regressions for checked-in hosted-gate invocation, bounded registry propagation, exact npm publish/SLSA attestation formats, fail-closed responses, and publication-to-release ordering.
- Generalized the trusted-publishing checklist and recorded immutable `v0.2.0` coordinates, incident boundaries, and no-blind-rerun recovery guidance.
- Expanded synthetic PDF compatibility coverage with pinned Chromium 150 tagged/untagged fixtures, an embedded OFL-licensed Lato subset, a CSS multi-column layout, and fail-closed image-only/malformed/oversized inputs without OCR.
- Added a reproducible two-page ReportLab 4.4.10 searchable-PDF fixture with pinned generator-wheel provenance, exact extracted text, compressed content, and an embedded Lato subset.
- Added turn-terminating non-PDF variant review and a bounded TUI `/career-review` flow that requires warning/discard acknowledgment, exact per-change inspection, explicit inclusion, and a later handle/ID-only editor handoff; PDF handles fail closed before selection or materialization.
- Added a final paged cross-change review and separate prepare choice before `/career-review` can place selected canonical IDs in the editor, with a back path that preserves the in-memory selection for revision.
- Replaced the final selected-change JSON object with compact labeled records that keep exact IDs, sections, line bounds, before/after text, and both evidence sets visible.
- Added constant-state final-review navigation that can reopen any selected exact record directly before the separate prepare-or-back decision.

## 0.2.0 - 2026-08-10

### Added

- Primary compact `career_run` tool with internal Career Core operation/schema discovery, ephemeral resume/result/review/variant handles, complete bounded in-memory results, compact analysis/match/review/materialization projections, and section/item detail hydration without nested `input_json`.
- `/career-tools` keeps the three raw Career Core compatibility tools available for explicit advanced use while removing them from normal active model context.
- Frozen synthetic `o200k_base` context benchmark: the active `career_run` contract is 302 tokens against the recorded 1,041-token prior raw-tool surface, with common synthetic managed results below 250 tokens.
- Local searchable-PDF résumé ingestion through a bounded, network-disabled worker, with explicit library notices for encrypted, image-only, malformed, oversized, or otherwise unextractable PDFs.
- `/career-workbench` prepares a bounded, visibly reviewable ordinary Pi editor prompt for complete score explanation, reviewed improvement suggestions, a question-led factual interview before reviewed replacements, direct reviewed exact replacements, or vacancy-specific variant review while keeping originals immutable. The command makes no provider/model call; only the user's later ordinary Pi submission invokes the selected provider. Non-PDF materialization requires explicit canonical change-ID selection in a later turn; PDFs stop at manual targeted changes.
- `/career-application` adds branch-aware company/role/status identity, scopes vacancies and result cards by immutable application ID, and names otherwise unnamed Pi sessions without creating workspace files.
- `/career-analyze` and `/career-match` expose complete successful Core results plus focused sections through a transient read-only pager, without storing or exporting full result JSON.
- `/career-setup` records or derives a suggestion-only preferred resume-variation directory. Workbench prompts recommend that privacy-reduced destination first after a separate user request, while creating no directory or file and granting no automatic write authority.

### Changed

- Replaced package-owned native artifacts with a local-first external resolver: bounded absolute `CAREER_CLI_PATH`, PATH `career`, package-local `@revazi/career`, then bounded acquisition of exact `@revazi/career@0.1.1` unless `PI_OFFLINE=1`.
- Expanded the reviewed external runtime matrix to ARM64/x64 macOS, GNU and musl Linux, and MSVC Windows through the exact eight-target `@revazi/career@0.1.1` launcher. Windows acquisition derives npm and its command shell from validated real installation/system paths, executes no PATH-selected shim, and cancels the detached npm process group.
- Exact managed Core 0.1.1 operation-catalog/schema-bundle compatibility now completes before private stdin opens. The reviewed Career package launcher owns native target/libc/provenance/mode or Windows file invariant/size/format/SHA-256 verification; pi-career caches routes only in memory and never retries an already-started operation on another route.
- Removed `runtime/` from source/package artifacts and replaced bundled-runtime/package checks with runtime-resolution, exact Career package, offline failure, and native-free tarball coverage.
- Workbench prompts now use `career_run` handles and native proposal payloads rather than model-visible schema discovery and manually reconstructed Core envelopes.
- Setup and library flows now rescan immediately, display indexed PDFs and actionable scan notices, and explain the searchable PDF/Markdown/text success path instead of silently showing an empty library.
- Reorganized the README around the recommended first-run flow, exact slash-command behavior, release-version boundaries, runtime acquisition, and privacy/persistence expectations.
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
