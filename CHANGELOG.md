# Changelog

## Unreleased

### Added

- Standalone Pi package with the stable `career_core_discover`, `career_core_resume`, and `career_core_job` tools.
- Self-contained reviewed native Career Core runtimes for `darwin-arm64` and `linux-x64-gnu`, pinned to Core commit `a3cdb4c6d7f966397e93ea4664071975bca7228c` with manifest/provenance/hash/size/mode/contract verification and fail-closed target selection.
- Bundled discovery-led `career-core` Agent Skill with no separate CLI prerequisite or stale oversized-result fallback.
- Reproducible checked-in TypeScript bundle, strict runtime/package-content verification, offline no-model and real bundled-operation smokes, isolated Pi install acceptance, and optional bundled-runtime fixture compatibility.
- Native CI execution for every claimed target without a separate Core checkout or provider credentials.
- Deterministic `/career-setup`, `/career-library`, `/career-vacancy`, `/career-match`, and `/career-analyze` workflows with bounded symlink-free text libraries, branch-aware consented session cards, conservative ranking, cancellation ownership, and RPC/TUI support without provider/model calls.
- Public-repository author, ownership, issue-form, private vulnerability-reporting, Dependabot, and pull-request hygiene.
- Synthetic process-boundary coverage adapted from Career Core commit `100774ed8bb3b39c019d64ce105af1e3f209144f`.
- Release-candidate guidance for a separately authorized future public `pi-career@0.1.0` npm package, GitHub tag, and release notes, while exact version/full-commit installation remains canonical and no current release is claimed.
- Exact locked normal/build `career-cli` dependency evidence for both native targets, selected third-party MIT/copyright payloads, Rust 1.97.1 Standard Library evidence, target dynamic imports, the required Unicode License V3 text, deterministic package checks, and explicit independent-review limits.
- Strict zero-vulnerability production and complete development/host-Pi audit gates, with bounded duplicate-key-rejecting JSON, trusted-tool enforcement, tool-shadowing tests, and npm environment override sanitization.

### Changed

- Strict package checks enforce exact public npm registry/access metadata, reject optional or bundled runtime dependency declarations, allow only approved documents, verify the extracted native license inventory, prove no Pi package contents or `node_modules`, enforce exactly four wildcard external peers, and run extracted load/runtime/install smokes.
- Pi development packages are updated to `0.84.0` (`typebox` `1.3.7`), retiring the temporary nonzero audit acceptance. `audit:production` and `audit:full` now both gate from low severity and invoke npm from the real Node installation rather than `PATH`; `check:publish` is a direct Node, no-publication readiness orchestrator combining both clean audits with strict package proof. npm tree/severity environment overrides are removed, duplicate decoded JSON keys are rejected, and package extraction uses verified absolute `/usr/bin/tar`.
