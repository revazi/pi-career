# Project instructions

## Scope

`pi-career` is a Pi adapter package in a publicly readable Git repository for explicitly reviewed Career Core targets. It owns the Pi adapter and runtime resolver, bundled Agent Skill, generated TypeScript bundle, packaging tests, and
Pi integration documentation. It does not own or package native Career Core binaries. Career Core remains authoritative for every algorithm and JSON contract.

Treat every Career Core checkout as read-only reference material. Do not add sibling-checkout, Cargo, source-build, arbitrary executable-download, or unpinned-package fallback. `CAREER_CLI_PATH`, PATH, and package-local executables
are caller-controlled routes and must pass exact managed-contract compatibility checks before receiving private stdin. The only permitted network-capable runtime behavior is bounded acquisition of the exact pinned `@revazi/career@0.2.0`
package after local routes fail; acquisition must complete before private stdin is opened, and `PI_OFFLINE=1` must disable it. Do not add copied Core schemas/algorithms, packaged runtime npm dependencies, lifecycle-script
downloads/builds, model/provider behavior, model-assisted commands, full-screen UI, payload/result persistence beyond the approved config/custom-entry workflow, telemetry, or MCP. Publication automation is permitted only through the explicitly approved, tag-triggered GitHub OIDC trusted-publishing path defined below.

## Working rules

- State a short plan before editing.
- Preserve `career_run` as the primary managed tool, preserve the exact raw compatibility names `career_core_discover`, `career_core_resume`, and `career_core_job`, and preserve the reviewed stdin, privacy, consent, cancellation, output-bound, and payload-free error guarantees while updating the runtime-resolution sections of [`docs/design.md`](docs/design.md).
- Keep TypeScript in `src/` authoritative. Generated `dist/index.js` and `dist/pdf-worker.js` are tracked only for clean Git/local/npm Pi loading and must reproduce with `npm run check:dist`.
- Do not package native Career Core binaries in pi-career. Delegate native target, libc, provenance, mode, size, format, and SHA-256 verification to the reviewed `@revazi/career` launcher.
- Cache resolved runtime routes only in memory and invalidate them when `CAREER_CLI_PATH` or `PATH` changes.
- An invalid explicit `CAREER_CLI_PATH` must fail without fallback. An automatically resolved executable that fails before launch may advance once to the next route; cancellation, timeout, or an already-started command must never retry another route.
- Preserve direct argv execution with `shell: false`, bounded stdin/stdout/stderr, process-tree cancellation for npm acquisition descendants, exact managed-contract validation, and payload-free adapter errors.
- Keep the npx package/version pinned and validate the exact reviewed six-package v2 launcher manifest before direct execution. Updating `@revazi/career` requires explicit compatibility, provenance, audit, and package review.
- Pi-provided packages remain exactly four wildcard external peer dependencies. Development versions and tooling stay lockfile-pinned; package tarballs must contain neither peer package contents nor `node_modules`.
- Runtime npm acquisition must derive npm from the real `process.execPath` installation, reject conflicting `npm_execpath`, and never invoke a PATH-selected npm/npx executable.
- `audit:production` and `audit:full` must remain clean at explicit `--audit-level=low`. Production/full audit and package orchestration must derive npm from the real `process.execPath` installation, reject conflicting `npm_execpath`, sanitize npm tree/severity environment overrides, reject duplicate decoded JSON keys, and use only verified absolute `/usr/bin/tar`. Do not add or regenerate an audit-acceptance baseline; remediate any future vulnerability or stop publication.
- Use synthetic fixtures. Never add real resumes, job descriptions, credentials, provider responses, or session files.
- No source/result/path/environment/raw-error logging at the adapter boundary.
- Do not commit, push, publish, release, change repository visibility, or mutate maintainer Pi settings without explicit approval.
- The sole permitted publication workflow is `.github/workflows/release.yml`, triggered only by reviewed `v*.*.*` tags after explicit release authorization. It must use npm Trusted Publishing through GitHub OIDC with `id-token: write`, the `npm` environment, exact pinned actions/tooling, full package gates, lifecycle scripts disabled, npm provenance, registry metadata verification, and GitHub Release creation only after successful publication. Never add an `NPM_TOKEN`, `NODE_AUTH_TOKEN`, OTP, long-lived publication credential, alternate publication workflow, automatic versioning/tagging, or retry without first querying authoritative registry state.
- Resolve runtime routes in this order: explicit `CAREER_CLI_PATH`, `career` on PATH, package-local `@revazi/career`, then acquisition of exact `@revazi/career@0.2.0`.
- The npx route is acquisition-only. It must locate/install the exact pinned `@revazi/career` package before any private document stdin is opened, then execute the resolved package launcher directly.
- `PI_OFFLINE=1` disables npm/npx acquisition and fails with stable installation guidance.
- `CAREER_CLI_PATH` and PATH executables are caller-controlled rather than npm-provenance-verified; they must pass exact managed operation-catalog and schema-bundle compatibility checks before private operations.
- Only the package-local/npx-acquired routes delegate native integrity verification to the `@revazi/career` launcher.
- Document that npm acquisition may leave ordinary npm cache data and does not provide secure erasure.

## Verification

Run before review:

```bash
npm ci
npm run build
npm run bench:tokens
npm run bench:tokens:compare
npm run check
npm run test:runtime-resolution
npm run test:career-package
npm run audit:production
npm run audit:full
npm run check:publish
PI_OFFLINE=1 npm run test:pi-smoke
PI_OFFLINE=1 npm run test:install
npm run test:compat # package runtime; fixture parity skips unless CAREER_CORE_FIXTURE_ROOT is explicitly supplied
git diff --check
```

When an installed compatible `career` and a reviewed fixture checkout are available, run:

```bash
CAREER_CORE_FIXTURE_ROOT=/absolute/path/to/reviewed/career-core npm run test:compat
```

Report exact commands/results and keep optional local fixture paths out of runtime code and hosted CI.
