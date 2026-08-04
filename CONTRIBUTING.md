# Contributing

## Scope

Keep changes limited to the standalone Pi adapter, reviewed package-owned runtime integration, Agent Skill, tests, build/package policy, and documentation. Career Core owns algorithms, schemas, scoring, and career-domain semantics; propose those changes in its repository instead of duplicating them here. Slash commands, UI, persistence, and model/provider workflows require a separate approved phase.

Read [`AGENTS.md`](AGENTS.md), [`docs/design.md`](docs/design.md), and [`SECURITY.md`](SECURITY.md) before changing code.

## Setup and checks

Use Node 22.19 or newer:

```bash
npm ci
npm run build
git diff --exit-code -- dist/index.js
npm run check
npm run test:bundled-runtime
npm run check:package
npm run audit:runtime
PI_OFFLINE=1 npm run test:pi-smoke
PI_OFFLINE=1 npm run test:install
git diff --check
```

The clean-checkout diff command must run immediately after the build. `npm run check:dist` compares source with the current working bundle; running it only after regenerating stale output does not prove the candidate revision already contained the exact artifact.

`npm run build` rebuilds only tracked `dist/index.js`. It must not build, download, or modify native runtime artifacts. `npm run check:runtime-artifacts` verifies the exact Core source/run provenance, runtime allowlist, target identities, hashes, sizes, modes, notices, and contract locks. Runtime refresh is a separately approved native-artifact import; do not hand-edit binaries/provenance, use Cargo/download hooks, or weaken a target check to make an unsupported host pass.

Optional compatibility is local, executes the bundled runtime, and requires an explicit reviewed fixture root:

```bash
CAREER_CORE_FIXTURE_ROOT=/absolute/path/to/reviewed/career-core npm run test:compat
```

## Pull requests

Keep one focused change per pull request. Describe runtime/adapter contracts, security/privacy, package-content and platform impact, Core provenance, and exact verification. Use synthetic data and preserve source provenance. Do not include private documents, credentials, sessions, raw diagnostics, machine-local paths, Git LFS objects, lifecycle scripts, downloads, publication, releases, signing, or notarization.
