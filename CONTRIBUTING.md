# Contributing

## Scope

Keep changes limited to the Pi adapter, approved deterministic slash-command workflow, reviewed external runtime resolver, Agent Skill, tests, build/package policy, and documentation. Career Core owns algorithms, schemas, scoring, and career-domain semantics; propose those changes in its repository instead of duplicating them here. The approved workbench may prepare a visible user-submitted prompt, and `career_run` may Core-review and materialize explicitly selected non-PDF changes in memory. Package-initiated provider/model calls, automatic submission, automatic file saving, and broader assisted-document behavior require a separate approved phase.

Read [`AGENTS.md`](AGENTS.md), [`docs/design.md`](docs/design.md), and [`SECURITY.md`](SECURITY.md) before changing code.

## Setup and checks

Use Node 22.19 or newer. Release verification uses npm 10.9.3 from the Node 22.19 CI toolchain:

```bash
npm ci
npm run build
git diff --exit-code -- dist/index.js dist/pdf-worker.js
npm run bench:tokens
npm run check
npm run test:runtime-resolution
npm run test:career-package
npm run audit:production
npm run audit:full
npm run check:publish
PI_OFFLINE=1 npm run test:pi-smoke
PI_OFFLINE=1 npm run test:install
npm run test:compat
git diff --check
```

The clean-checkout diff command must run immediately after the build. `npm run check:dist` compares source with the current working bundle; running it only after regenerating stale output does not prove the candidate revision already contained the exact artifact.

`npm run build` rebuilds only tracked `dist/index.js` and `dist/pdf-worker.js`. It must not build, import, or package native runtime artifacts. The resolver must keep the fixed local-first route order, exact `@revazi/career@0.1.1` acquisition coordinate, pre-private-input managed compatibility check, trusted npm derivation, offline behavior, and payload-free failures. Updating the external package coordinate requires separate compatibility, provenance, audit, and package review.

`npm run audit:production` is the strict zero-vulnerability package-owned production audit and `npm run audit:full` is the strict zero-vulnerability development/host-Pi audit, both with an explicit low-severity threshold. Production/full audit and package checks derive npm from the real `process.execPath` installation, verify any inherited `npm_execpath`, remove omit/include/audit-level/`NODE_ENV` overrides, reject duplicate decoded JSON keys, and never resolve npm or tar from `PATH`. `npm run check:publish` is the direct Node authoritative readiness check, not publication authorization: it requires both clean audits and verifies the packed/extracted package, external peers, load, and isolated install. Do not add an audit-acceptance baseline for future vulnerabilities; remediate them or stop publication.

Optional fixture parity uses the exact Career package runtime and requires an explicit reviewed fixture root:

```bash
CAREER_CORE_FIXTURE_ROOT=/absolute/path/to/reviewed/career-core npm run test:compat
```

## Pull requests

Keep one focused change per pull request. Describe runtime/adapter contracts, security/privacy, package-content and platform impact, Core provenance, and exact verification. Use synthetic data and preserve source provenance. Do not include private documents, credentials, sessions, raw diagnostics, machine-local paths, Git LFS objects, lifecycle scripts, arbitrary/unpinned downloads, publication, releases, signing, or notarization.

Ordinary pull requests run the single required `Adapter checks` job. It covers the build, deterministic tests, native-free package proof, offline loading/install, and diff checks without acquiring or executing the external Career package. The eight-target [External Career Compatibility workflow](.github/workflows/external-career.yml) is manual: maintainers dispatch it for an external package coordinate, launcher/platform catalog, runtime resolver, managed Core contract, or release-candidate review. Do not dispatch that costly matrix for unrelated documentation or adapter-only pull requests.
