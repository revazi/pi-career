## Scope

- What changed:
- Explicit non-scope:

## Contracts and security

- Tool/package compatibility impact:
- Security/privacy impact:
- Career Core provenance or dependency impact:

## Verification

- [ ] `npm ci`
- [ ] `npm run build`
- [ ] `git diff --exit-code -- dist/index.js dist/pdf-worker.js` immediately after build on a clean checkout
- [ ] `npm run check`
- [ ] `npm run check:runtime-artifacts`
- [ ] `npm run test:bundled-runtime`
- [ ] `npm run audit:production`
- [ ] `npm run audit:full`
- [ ] `npm run check:publish`
- [ ] `PI_OFFLINE=1 npm run test:pi-smoke`
- [ ] `PI_OFFLINE=1 npm run test:install`
- [ ] Optional bundled-runtime compatibility with reviewed Core fixtures (when explicitly configured)
- [ ] `git diff --check`

List exact results and residual limitations below.
