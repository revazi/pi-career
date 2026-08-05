# Project instructions

## Scope

`pi-career` is a self-contained Pi package in a publicly readable Git repository on explicitly reviewed native targets. It owns the Pi adapter, package-owned runtime artifacts/resolver, bundled Agent Skill, generated TypeScript bundle, packaging tests, and Pi integration documentation. Career Core remains authoritative for every algorithm and JSON contract.

Treat every Career Core checkout as read-only reference material. Do not add runtime sibling-checkout/PATH/Cargo fallback, copied Core schemas/algorithms, install-time downloads/builds, runtime npm dependencies, lifecycle scripts, network/model/provider behavior, model-assisted commands, full-screen UI, payload/result file persistence beyond the approved config/custom-entry workflow, telemetry, MCP, or publication workflows.

## Working rules

- State a short plan before editing.
- Preserve the exact three tool names and reviewed process boundary in [`docs/design.md`](docs/design.md).
- Keep TypeScript in `src/` authoritative. `dist/index.js` is tracked only for clean Git/local Pi loading and must reproduce with `npm run check:dist`.
- Keep runtime targets exactly `darwin-arm64` and `linux-x64-gnu`; verify manifest/provenance/hash/size/mode before changing imported artifacts and fail every other target closed.
- Pi-provided packages remain external peer dependencies. Development versions and tooling stay lockfile-pinned.
- Use synthetic fixtures. Never add real resumes, job descriptions, credentials, provider responses, or session files.
- No source/result/path/environment/raw-error logging at the adapter boundary.
- Do not commit, push, publish, release, change repository visibility, or mutate maintainer Pi settings without explicit approval.

## Verification

Run before review:

```bash
npm ci
npm run build
npm run check
npm run test:bundled-runtime
npm run check:package
npm run audit:runtime
PI_OFFLINE=1 npm run test:pi-smoke
PI_OFFLINE=1 npm run test:install
npm run test:compat # bundled runtime; skips unless CAREER_CORE_FIXTURE_ROOT is explicitly supplied
git diff --check
```

When an installed compatible `career` and a reviewed fixture checkout are available, run:

```bash
CAREER_CORE_FIXTURE_ROOT=/absolute/path/to/reviewed/career-core npm run test:compat
```

Report exact commands/results and keep optional local fixture paths out of runtime code and hosted CI.
