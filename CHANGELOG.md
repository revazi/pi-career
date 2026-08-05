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
