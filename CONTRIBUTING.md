# Contributing

## Scope

Keep changes limited to the standalone Pi adapter, approved deterministic slash-command workflow, reviewed package-owned runtime integration, Agent Skill, tests, build/package policy, and documentation. Career Core owns algorithms, schemas, scoring, and career-domain semantics; propose those changes in its repository instead of duplicating them here. Provider/model workflows and assisted document generation require a separate approved phase.

Read [`AGENTS.md`](AGENTS.md), [`docs/design.md`](docs/design.md), and [`SECURITY.md`](SECURITY.md) before changing code.

## Setup and checks

Use Node 22.19 or newer. The expiring accepted-development audit is pinned to npm 10.9.3, matching Node 22.19 CI; `check:publish` intentionally rejects another npm version as report/tool drift:

```bash
npm ci
npm run build
git diff --exit-code -- dist/index.js
npm run check
npm run test:bundled-runtime
npm run audit:production
npm run check:publish
PI_OFFLINE=1 npm run test:pi-smoke
PI_OFFLINE=1 npm run test:install
npm run test:compat
git diff --check
```

The clean-checkout diff command must run immediately after the build. `npm run check:dist` compares source with the current working bundle; running it only after regenerating stale output does not prove the candidate revision already contained the exact artifact.

`npm run build` rebuilds only tracked `dist/index.js`. It must not build, download, or modify native runtime artifacts. `npm run check:runtime-artifacts` verifies the exact Core source/run provenance, runtime allowlist, target identities, hashes, sizes, modes, notices, and contract locks. Runtime refresh is a separately approved native-artifact import; do not hand-edit binaries/provenance, use Cargo/download hooks, or weaken a target check to make an unsupported host pass.

`npm run audit:production` is the strict zero-vulnerability package-owned production audit with an explicit low-severity threshold. Production/full audit and package checks derive npm from the real `process.execPath` installation, verify any inherited `npm_execpath`, remove omit/include/audit-level/`NODE_ENV` overrides, reject duplicate decoded JSON keys, and never resolve npm or tar from `PATH`. `npm run check:publish` is the direct Node authoritative readiness check, not publication authorization: it also requires the exact unexpired accepted-development audit and verifies the packed/extracted package, external peers, load, and isolated install. The accepted development/host-Pi baseline is temporary and explicitly is not a clean full audit; any drift or expiry must fail rather than be updated mechanically.

Optional compatibility is local, executes the bundled runtime, and requires an explicit reviewed fixture root:

```bash
CAREER_CORE_FIXTURE_ROOT=/absolute/path/to/reviewed/career-core npm run test:compat
```

## Pull requests

Keep one focused change per pull request. Describe runtime/adapter contracts, security/privacy, package-content and platform impact, Core provenance, and exact verification. Use synthetic data and preserve source provenance. Do not include private documents, credentials, sessions, raw diagnostics, machine-local paths, Git LFS objects, lifecycle scripts, downloads, publication, releases, signing, or notarization.
