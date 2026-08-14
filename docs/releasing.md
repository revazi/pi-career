# Release process

This document defines the bounded trusted-publishing process for the next explicitly authorized pi-career release and records the historical `v0.1.0` and `v0.2.0` outcomes. In the instructions below, `<version>` is the exact package version without `v`, `<tag>` is `v<version>`, and `<sha>` is the full frozen candidate commit.

## Release boundary

One coordinated release may create exactly:

1. one public `pi-career@<version>` npm package on `https://registry.npmjs.org/`;
2. one annotated, unsigned `<tag>` Git tag pointing to the exact published commit; and
3. one GitHub Release for that tag with notes derived from the finalized [`CHANGELOG.md`](../CHANGELOG.md) entry.

The npm package must be the native-free allowlisted artifact verified by `npm run check:package`. It contains the Pi extension, generated PDF worker, Agent Skill, and documentation. It must contain no `runtime/`, native executable, `node_modules`, Pi peer package contents, production dependency tree, lifecycle download/build hook, or publication script.

Career Core distribution remains external. The candidate pins exact [`@revazi/career@0.2.0`](https://www.npmjs.com/package/@revazi/career/v/0.2.0); its reviewed launcher owns native target/libc, package metadata, provenance, file invariants, size, format, architecture, and SHA-256 verification. Pi-career supports only its six macOS/Linux targets and must not copy those algorithms or artifacts. Pi-career validates the exact ordered six-package v2 launcher manifest, declared file allowlist, and `career` bin before direct execution.

The reviewed external release is bound to Career Core commit/tag `536690632884c17336cc3c108f1bba0f254b862b`/`v0.2.0` and successful protected publication run [`31761238274`](https://github.com/revazi/career-core/actions/runs/31761238274). The launcher registry integrity is `sha512-5aksKh9S2fqPKBwlUY94XgCHjggr2Gep45zEWOMBNEfRtXvC/pYnlkI9CYrVHBFR8/gfGQog4pwV854FMzDxww==`; registry metadata reports SLSA v1 provenance for the user-facing launcher and all six lockstep launcher-owned native packages.

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

That release bundled native Career Core artifacts. Its dependency/license/provenance evidence remains historical in [`native-dependency-inventory.md`](native-dependency-inventory.md) and [`licenses/`](licenses/). None of those native files may re-enter a future package.

## Historical `v0.2.0` outcome

Release execution completed on 2026-08-10:

- npm: [`pi-career@0.2.0`](https://www.npmjs.com/package/pi-career/v/0.2.0)
- published commit: `6db58644a6140202de2f2d661a740acd298c79b5`
- annotated unsigned tag and GitHub Release: [`v0.2.0`](https://github.com/revazi/pi-career/releases/tag/v0.2.0)
- npm integrity: `sha512-2V0z42oxsDHdE9a/UTskCzLY3inU0/DX30h2QhXse/Y3rAJpsaaNweqVhvZwZlMUovtyBu7pnGSpSo8CLhVOBg==`
- npm shasum: `c182b09945eee8cd85d817b7ce4965784731fd49`
- same-SHA six-target compatibility run: [`31352965430`](https://github.com/revazi/pi-career/actions/runs/31352965430)
- OIDC publication run: [`31353182855`](https://github.com/revazi/pi-career/actions/runs/31353182855)
- npm publisher identity: GitHub Actions trusted publisher for `revazi/pi-career`, workflow `release.yml`, environment `npm`
- SLSA provenance subject and resolved Git dependency: exact `pi-career@0.2.0` tarball and commit above
- custom GitHub Release assets: none

The first tag-triggered attempt, run [`31352716654`](https://github.com/revazi/pi-career/actions/runs/31352716654), failed before dependency installation or publication because `shell: node {0}` resolved a relative ESM import from GitHub's temporary script directory. Registry absence was reconfirmed; no publish retry occurred. PR [#23](https://github.com/revazi/pi-career/pull/23) moved the hosted-gate query into a checked-in script. After explicit incident authorization, the unpublished tag was replaced once on the corrected candidate.

In run `31353182855`, every gate and the OIDC `npm publish` step succeeded. The run then failed closed before GitHub Release creation because npm's attestation endpoint propagated after the original one-minute bound and the resulting SLSA bundle used the current Sigstore v0.3 media type while npm's publish attestation remained v0.2. The version already existed authoritatively, so it was never rerun or republished. PR [#24](https://github.com/revazi/pi-career/pull/24) extended bounded propagation polling and validates both exact bundle formats. The corrected verifier subsequently proved registry metadata, tarball bytes, trusted-publisher identity, provenance workflow/tag/SHA, and latest dist-tag; exact published Pi install/load/runtime/offline/remove acceptance passed before the GitHub Release and deployment status were finalized.

**Never rerun or republish after an ambiguous publish response.** Query authoritative registry state first. A post-publication recovery may finish verification and release-channel bookkeeping only; it must not create an alternate publication path, overwrite an immutable npm version, or move the published tag.

## Release gates

A skipped, unknown, stale, or merely planned result is not a pass.

### 1. Freeze and review the exact candidate

- Start from synchronized public `main` and identify one full candidate SHA.
- Require a clean Git tree and no divergence from `origin/main`.
- Confirm `package.json`, the root package-lock entries, the Skill metadata, package assertions, changelog, README, and release documentation all identify the candidate version where appropriate.
- Keep Career Core and `@revazi/career` compatibility coordinates at exact `0.2.0` unless a separate compatibility/provenance review explicitly updates them; do not confuse the adapter release version with the external runtime version.
- Confirm `package.json` is explicitly public only at `https://registry.npmjs.org/`, has `os` exactly `['darwin', 'linux']`, has exactly four wildcard Pi peers, declares no production/optional/bundled dependency tree, and has no lifecycle/publication script.
- Ensure the candidate contains no real resume, vacancy, credentials, Pi session, provider output, generated local path, npm token, or unreviewed executable.
- Review the complete diff from the prior release tag, including authoritative `src/`, generated `dist/index.js`/`dist/pdf-worker.js`, `career_run`, all three exact raw tools, slash commands, external resolver, Skill, release automation, and package documentation.
- Do not move the candidate after local/hosted evidence is recorded. Any content change creates a new candidate and requires the gates again.

### 2. Review the external runtime boundary

- Confirm unsupported local/Git extension initialization registers no command/tool and fails with stable payload-free `unsupported_platform` before explicit/PATH lookup, package validation, acquisition, compatibility probing, or private stdin; retain invocation/resolver guards as defense in depth.
- Confirm the only acquisition coordinate remains exact `@revazi/career@0.2.0` from the canonical npm registry.
- Confirm runtime order remains: absolute `CAREER_CLI_PATH`, PATH `career`, package-local exact launcher, then bounded exact-package acquisition unless `PI_OFFLINE=1`.
- Confirm every caller-controlled route must pass the exact managed Core 0.2.0 operation catalog and required self-contained schema bundles before private stdin opens.
- Confirm package-local/acquired routes validate the exact ordered six-package v2 launcher manifest and delegate native target/libc/provenance/mode/size/format/architecture/SHA-256 verification to the reviewed launcher on the six supported targets.
- Confirm the external release's launcher plus six native packages remain version-lockstep, have canonical registry integrity and SLSA v1 provenance, and are bound to reviewed Core commit `536690632884c17336cc3c108f1bba0f254b862b`.
- Run the exact-package integration test on the six hosted macOS/GNU Linux/musl Linux release targets. Updating the external package coordinate, supported native target list, launcher schema, or managed Core contract requires separate compatibility, provenance, audit, and package review before this gate can pass.

### 3. Require clean audits and strict package proof

`npm run audit:production` and `npm run audit:full` must both report zero vulnerabilities at explicit `--audit-level=low`. No audit acceptance baseline is allowed.

`npm run check:publish` must prove:

- both strict audits are clean;
- trusted npm is derived from the real Node installation and conflicting `npm_execpath` is rejected;
- npm environment overrides and duplicate decoded JSON keys cannot weaken checks;
- package listing/extraction uses verified absolute `/usr/bin/tar`;
- the tarball matches the exact allowlist and size bounds and declares `os: ['darwin', 'linux']`;
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
npm run bench:tokens:compare
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
- Token measurements must satisfy the active before/optimizing/after manifest: immutable Git-history snapshot/manifest bytes and source/Skill tree anchors, exact frozen before/after comparability and deltas, unchanged current shape/invariants/budgets, and no current workflow regression relative to the frozen after snapshot. Later current source need not equal the historical after tree.
- Exact-package acquisition must execute managed discovery plus representative synthetic resume/job operations.
- Compatibility must run against an explicitly reviewed fixture checkout. A skip is not release evidence.
- The production npm tree must remain empty apart from unmet external peers expected in the Pi host.
- No command may create a repository tarball, native runtime, payload/result file, audit-acceptance baseline, or publication side effect. Reviewed synthetic token snapshots are benchmark evidence, not vulnerability acceptance.

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

- convert `CHANGELOG.md` candidate notes to a dated candidate-version entry;
- ensure README installation uses the exact candidate `npm:pi-career@<version>` coordinate and clearly distinguishes historical releases;
- state that pi-career packages no native runtime, supports only the six reviewed macOS/Linux targets, uses exact external `@revazi/career@0.2.0`, and validates its exact ordered six-package v2 manifest;
- state that both production and complete development/host-Pi audits are clean at the explicit low threshold;
- keep all full commit SHA and npm integrity placeholders out of tracked files until those values exist; record them in the GitHub Release after publication.

The finalization commit cannot contain its own SHA. Only the separately authorized final clean commit may be published and receive `<tag>`.

## Manual pre-publication checks

Run these only on the frozen clean candidate:

1. Confirm npm package `pi-career` has exactly the GitHub Actions trusted publisher `revazi/pi-career`, workflow `release.yml`, environment `npm`.
2. Confirm the GitHub `npm` environment exists and applies the reviewed deployment protections. No npm token or OTP may be stored in GitHub, npm configuration, repository files, Pi messages, logs, or release notes.
3. Confirm `npm view pi-career@<version> version --json` reports no existing version. npm versions are immutable.
4. Run trusted `npm pack --dry-run --json --ignore-scripts` or rely on the stricter recorded `check:publish` artifact proof.
5. Record the candidate full SHA, package filename/size, clean audit results, hosted run URLs, and reviewed fixture SHA outside private content.
6. Obtain explicit release authorization. Do not infer authorization from readiness work.

## Authorized release execution

Only after every gate passes and the maintainer explicitly authorizes release execution:

1. Reconfirm the clean SHA, branch protection checks, trusted-publisher/environment configuration, canonical registry, and absence of `pi-career@<version>`.
2. Create one annotated unsigned `<tag>` on the exact candidate and push only that tag. The tag is the immutable input that triggers `.github/workflows/release.yml`; the workflow must never create or move it.
3. The workflow must verify the tag/version/changelog/SHA, install exact trusted-publishing-compatible npm tooling, run the complete package publication gate, and publish with lifecycle scripts disabled, public/latest coordinates, and npm provenance through OIDC.
4. If publication returns an ambiguous response, query the registry before any rerun. Never move the tag, attempt to overwrite the version, or blindly republish.
5. Before creating the GitHub Release, the workflow must verify registry metadata: version, repository, four wildcard peers, no dependency tree/lifecycle scripts, tarball integrity, shasum, provenance, and `gitHead` equal to the tagged candidate SHA.
6. The workflow must create the GitHub Release from the existing `<tag>` with:
   - full commit SHA;
   - npm integrity and shasum;
   - exact external `@revazi/career@0.2.0` coordinate;
   - all six supported macOS, GNU Linux, and musl Linux targets, plus a clear note that only the launcher is a pi-career installation surface;
   - native-free pi-career package statement;
   - clean production/full audit statement;
   - no crate publication, signing/notarization claim, or custom release asset.
7. In an isolated Pi agent directory, install exact `npm:pi-career@<version>`, list/load it, exercise exact-package runtime acquisition with synthetic operations on a supported target, test offline failure, and remove it.
8. Recheck the npm dist-tag, Git tag target, GitHub Release target, provenance, and main CI after all channels settle.

Do not sign, attach assets, change repository visibility, add an alternate publication workflow or token-based path, publish another registry tag/version, or retry an ambiguous operation without first querying authoritative state. A failed post-publication check is an incident, not permission to replace the immutable published version.
