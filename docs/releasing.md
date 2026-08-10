# Release process

This document defines the bounded trusted-publishing release process for `pi-career@0.2.0` and records the historical `v0.1.0` outcome.

## Release boundary

The coordinated `v0.2.0` release may create exactly:

1. one public `pi-career@0.2.0` npm package on `https://registry.npmjs.org/`;
2. one annotated, unsigned `v0.2.0` Git tag pointing to the exact published commit; and
3. one GitHub Release for that tag with notes derived from the finalized [`CHANGELOG.md`](../CHANGELOG.md) entry.

The npm package must be the native-free allowlisted artifact verified by `npm run check:package`. It contains the Pi extension, generated PDF worker, Agent Skill, and documentation. It must contain no `runtime/`, native executable, `node_modules`, Pi peer package contents, production dependency tree, lifecycle download/build hook, or publication script.

Career Core distribution remains external. The candidate pins exact [`@revazi/career@0.1.1`](https://www.npmjs.com/package/@revazi/career/v/0.1.1); its reviewed launcher owns native target/libc, package metadata, provenance, Unix mode or Windows file invariant, size, format, architecture, and SHA-256 verification. Pi-career must not copy those algorithms or artifacts.

The reviewed external release is bound to Career Core commit/tag `0318b3b0993ee23093c8f023757fa7e4d8b3b8e0`/`v0.1.1` and successful protected publication run [`31346152236`](https://github.com/revazi/career-core/actions/runs/31346152236). The launcher registry integrity is `sha512-K2WojK0wbuMt4WWT87jrLUiRWLwlDeYR0BcSTqlaTGc0SNw4z7VWkSe7utFwH2MFhHaIE1iHWfpsj+nNlHklvQ==`; registry metadata reports SLSA v1 provenance for the launcher and all eight lockstep native packages.

The sole permitted automated publication path is the tag-triggered `.github/workflows/release.yml` workflow using npm Trusted Publishing through GitHub OIDC and the protected `npm` environment. It must use no `NPM_TOKEN`, `NODE_AUTH_TOKEN`, OTP, or other long-lived publication credential. Preparation, CI success, a version bump, workflow availability, or this document does **not** authorize tag creation/push, npm publication, or a GitHub Release; release execution remains a separate explicit maintainer action. Do not publish to crates.io, attach an npm tarball/native binary as a custom GitHub Release asset, add signing/notarization claims, or add lifecycle/publication scripts.

The exact npm version and full published commit SHA are the canonical installation and audit coordinates. The GitHub Release notes must state that SHA and the npm registry integrity. A tag is a discovery label, not a substitute for immutable commit review.

## Historical `v0.1.0` outcome

Release execution completed on 2026-08-06:

- npm: [`pi-career@0.1.0`](https://www.npmjs.com/package/pi-career/v/0.1.0)
- commit: `967da62503bc8a97c070946f6506ea3471baeb34`
- annotated unsigned tag: [`v0.1.0`](https://github.com/revazi/pi-career/releases/tag/v0.1.0)
- npm integrity: `sha512-mmbDdWDyWz77f2uLzZECJT9E6w1ZRCJjYFrUnZd3ldoS6ehEa5DrCENIfavHR5xMOFi0of6AVQ35ZTxwpeDeAQ==`
- npm shasum: `4212cea50c08c98771df267361cee28070a15765`
- custom GitHub Release assets: none

That release bundled native Career Core artifacts. Its dependency/license/provenance evidence remains historical in [`native-dependency-inventory.md`](native-dependency-inventory.md) and [`licenses/`](licenses/). None of those native files may re-enter the `v0.2.0` package.

## `v0.2.0` release gates

A skipped, unknown, stale, or merely planned result is not a pass.

### 1. Freeze and review the exact candidate

- Start from synchronized public `main` and identify one full candidate SHA.
- Require a clean Git tree and no divergence from `origin/main`.
- Confirm `package.json`, the root package-lock entries, the Skill metadata, package assertions, changelog, README, and release documentation all identify pi-career `0.2.0` where appropriate.
- Keep Career Core and `@revazi/career` compatibility coordinates at exact `0.1.1`; do not confuse the adapter release version with the external runtime version.
- Confirm `package.json` is explicitly public only at `https://registry.npmjs.org/`, has exactly four wildcard Pi peers, declares no production/optional/bundled dependency tree, and has no lifecycle/publication script.
- Ensure the candidate contains no real resume, vacancy, credentials, Pi session, provider output, generated local path, npm token, or unreviewed executable.
- Review the complete diff from `v0.1.0`, including authoritative `src/`, generated `dist/index.js`/`dist/pdf-worker.js`, `career_run`, all three exact raw tools, slash commands, external resolver, Skill, and package documentation.
- Do not move the candidate after local/hosted evidence is recorded. Any content change creates a new candidate and requires the gates again.

### 2. Review the external runtime boundary

- Confirm the only acquisition coordinate remains exact `@revazi/career@0.1.1` from the canonical npm registry.
- Confirm runtime order remains: absolute `CAREER_CLI_PATH`, PATH `career`, package-local exact launcher, then bounded exact-package acquisition unless `PI_OFFLINE=1`.
- Confirm every caller-controlled route must pass the exact managed Core 0.1.1 operation catalog and required self-contained schema bundles before private stdin opens.
- Confirm package-local/acquired routes delegate native target/libc/provenance/mode or Windows file invariant/size/format/architecture/SHA-256 verification to the reviewed launcher.
- Confirm all nine exact npm packages remain version-lockstep, have canonical registry integrity and SLSA v1 provenance, and match the ordered v2 launcher catalog from reviewed Core commit `0318b3b0993ee23093c8f023757fa7e4d8b3b8e0`.
- Run the exact-package integration test on the six hosted macOS/GNU Linux/musl Linux release targets. Updating the external package coordinate, native target list, launcher schema, or managed Core contract requires separate compatibility, provenance, audit, and package review before this gate can pass.

### 3. Require clean audits and strict package proof

`npm run audit:production` and `npm run audit:full` must both report zero vulnerabilities at explicit `--audit-level=low`. No audit acceptance baseline is allowed.

`npm run check:publish` must prove:

- both strict audits are clean;
- trusted npm is derived from the real Node installation and conflicting `npm_execpath` is rejected;
- npm environment overrides and duplicate decoded JSON keys cannot weaken checks;
- package listing/extraction uses verified absolute `/usr/bin/tar`;
- the tarball matches the exact allowlist and size bounds;
- no native runtime, `node_modules`, Pi peer contents, production dependency tree, or lifecycle/publication script is present;
- extracted package loading, stable offline failure, and isolated Pi install/list/remove behavior pass.

Do not use `npm audit fix --force`, downgrade the Pi baseline, hand-edit third-party lock entries, or add an acceptance file. A future vulnerability blocks release until remediated.

### 4. Run complete verification on the frozen SHA

Run with Node.js 22.19 or newer:

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
CAREER_CORE_FIXTURE_ROOT=/absolute/path/to/reviewed/career-core npm run test:compat
npm ls --omit=dev --depth=0
git diff --check
```

Requirements:

- The immediate dist diff after `npm run build` must pass; a later reproducibility test alone does not prove the candidate committed the generated output.
- Token measurements must exactly reproduce the committed baseline and remain within budgets.
- Exact-package acquisition must execute managed discovery plus representative synthetic resume/job operations.
- Compatibility must run against an explicitly reviewed fixture checkout. A skip is not release evidence.
- The production npm tree must remain empty apart from unmet external peers expected in the Pi host.
- No command may create a repository tarball, native runtime, payload/result file, acceptance baseline, or publication side effect.

### 5. Require hosted checks on the same SHA

Main branch protection must require the strict, up-to-date `Adapter checks` context. That ordinary pull-request job proves the build, deterministic adapter tests, native-free package, offline loading/install, and diff checks without acquiring or executing the external Career package.

The costly six-target matrix is not an automatic pull-request check. After freezing the final SHA on public `main`, manually dispatch `.github/workflows/external-career.yml` on that exact ref and require all six native GitHub checks:

```bash
gh workflow run external-career.yml --ref main
```

- `External Career package (darwin-arm64)`;
- `External Career package (darwin-x64)`;
- `External Career package (linux-x64-gnu)`;
- `External Career package (linux-arm64-gnu)`;
- `External Career package (linux-x64-musl)`;
- `External Career package (linux-arm64-musl)`.

Record the dispatched run's `headSha` and reject it unless it equals the frozen release SHA. The macOS arm64 and Linux x64 GNU jobs execute the complete release ladder, including immediate dist reproducibility, clean audits, native-free package proof, offline smokes, and diff checks. Every target job executes a native Node build, exact launcher acquisition, managed contracts, representative synthetic resume/job operations, runtime resolver checks, and offline package load. Dispatch this matrix for external package coordinate, launcher/platform catalog, runtime resolver, managed Core contract, and release reviews—not for unrelated ordinary pull requests.

### 6. Finalize release-facing text

Before release authorization:

- convert `CHANGELOG.md` candidate notes to the dated `0.2.0` entry;
- ensure README installation uses exact `npm:pi-career@0.2.0` and clearly distinguishes historical v0.1.0;
- state that pi-career packages no native runtime and identify exact external `@revazi/career@0.1.1` plus all eight supported targets;
- state that both production and complete development/host-Pi audits are clean at the explicit low threshold;
- keep all full commit SHA and npm integrity placeholders out of tracked files until those values exist; record them in the GitHub Release after publication.

The finalization commit cannot contain its own SHA. Only the separately authorized final clean commit may be published and receive `v0.2.0`.

## Manual pre-publication checks

Run these only on the frozen clean candidate:

1. Confirm npm package `pi-career` has exactly the GitHub Actions trusted publisher `revazi/pi-career`, workflow `release.yml`, environment `npm`.
2. Confirm the GitHub `npm` environment exists and applies the reviewed deployment protections. No npm token or OTP may be stored in GitHub, npm configuration, repository files, Pi messages, logs, or release notes.
3. Confirm `npm view pi-career@0.2.0 version --json` reports no existing version. npm versions are immutable.
4. Run trusted `npm pack --dry-run --json --ignore-scripts` or rely on the stricter recorded `check:publish` artifact proof.
5. Record the candidate full SHA, package filename/size, clean audit results, hosted run URLs, and reviewed fixture SHA outside private content.
6. Obtain explicit release authorization. Do not infer authorization from readiness work.

## Authorized release execution

Only after every gate passes and the maintainer explicitly authorizes release execution:

1. Reconfirm the clean SHA, branch protection checks, trusted-publisher/environment configuration, canonical registry, and absence of `pi-career@0.2.0`.
2. Create one annotated unsigned `v0.2.0` tag on the exact candidate and push only that tag. The tag is the immutable input that triggers `.github/workflows/release.yml`; the workflow must never create or move it.
3. The workflow must verify the tag/version/changelog/SHA, install exact trusted-publishing-compatible npm tooling, run the complete package publication gate, and publish with lifecycle scripts disabled, public/latest coordinates, and npm provenance through OIDC.
4. If publication returns an ambiguous response, query the registry before any rerun. Never move the tag, attempt to overwrite the version, or blindly republish.
5. Before creating the GitHub Release, the workflow must verify registry metadata: version, repository, four wildcard peers, no dependency tree/lifecycle scripts, tarball integrity, shasum, provenance, and `gitHead` equal to the tagged candidate SHA.
6. The workflow must create the GitHub Release from the existing `v0.2.0` tag with:
   - full commit SHA;
   - npm integrity and shasum;
   - exact external `@revazi/career@0.1.1` coordinate;
   - all eight reviewed macOS, GNU Linux, musl Linux, and MSVC Windows targets;
   - native-free pi-career package statement;
   - clean production/full audit statement;
   - no crate publication, signing/notarization claim, or custom release asset.
7. In an isolated Pi agent directory, install exact `npm:pi-career@0.2.0`, list/load it, exercise exact-package runtime acquisition with synthetic operations on a supported target, test offline failure, and remove it.
8. Recheck the npm dist-tag, Git tag target, GitHub Release target, provenance, and main CI after all channels settle.

Do not sign, attach assets, change repository visibility, add an alternate publication workflow or token-based path, publish another registry tag/version, or retry an ambiguous operation without first querying authoritative state. A failed post-publication check is an incident, not permission to replace `0.2.0`.
