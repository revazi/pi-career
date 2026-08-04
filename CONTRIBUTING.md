# Contributing

## Scope

Keep changes limited to the standalone Pi adapter, Agent Skill, tests, build/package policy, and documentation. Career Core owns the CLI, algorithms, schemas, and career-domain semantics; propose those changes in its repository instead of duplicating them here.

Read [`AGENTS.md`](AGENTS.md), [`docs/design.md`](docs/design.md), and [`SECURITY.md`](SECURITY.md) before changing code.

## Setup and checks

Use Node 22.19 or newer:

```bash
npm ci
npm run build
npm run check
npm run check:package
npm run audit:runtime
PI_OFFLINE=1 npm run test:pi-smoke
PI_OFFLINE=1 npm run test:install
git diff --check
```

The checked-in bundle must match a clean rebuild. Do not hand-edit `dist/index.js`. On a clean checkout of the candidate revision, reproduce the hosted tracked-artifact gate with:

```bash
npm run build
git diff --exit-code -- dist/index.js
```

The diff command must run immediately after the build; running only `npm run check:dist` after regenerating a stale bundle does not prove that the candidate revision already contained it.

Optional installed-CLI compatibility is local and requires an explicit reviewed fixture root:

```bash
CAREER_CORE_FIXTURE_ROOT=/absolute/path/to/career-core npm run test:compat
```

## Pull requests

Keep one focused change per pull request. Describe adapter-contract, security/privacy, package-content, and compatibility impact; list exact verification. Use synthetic data and preserve source provenance. Do not publish npm artifacts or create releases as part of routine contributions.
