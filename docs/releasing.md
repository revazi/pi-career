# Release preparation

This document defines the smallest possible future `v0.1.0` release process. It is a checklist, not release authorization. The repository remains **Unreleased**: no npm version, tag, GitHub Release, crate publication, custom release asset, signature, or notarization is claimed by this release-preparation change.

## Approved future channel boundary

If every gate below is closed and a maintainer separately authorizes release execution, the only planned channels are:

1. one public `pi-career@0.1.0` npm package;
2. one annotated, unsigned `v0.1.0` Git tag pointing to the exact published commit; and
3. one GitHub Release containing notes derived from the finalized `CHANGELOG.md` entry.

The npm package contains the strict allowlisted artifact tested by `npm run check:package`, including both unsigned native binaries. The project will not publish to crates.io, attach the npm tarball or native binary as a custom GitHub Release asset, add lifecycle/publication scripts, or claim signing/notarization. GitHub automatically generated source archives contain the complete tracked tree and are not substitutes for the tested npm artifact.

The exact npm version and reviewed full commit SHA are the canonical installation and audit coordinates. The GitHub Release notes must state that SHA and the npm package's registry integrity. A tag is a discovery label, not a substitute for immutable commit review, and README Git installation instructions must continue to use a full SHA.

There is no automated publication workflow. Release execution is manual and requires separate explicit authorization after the candidate commit and hosted checks are frozen.

## Blocking gates

Every item in this section blocks the future npm publication, tag, and GitHub Release. A skipped, unknown, or merely planned result is not a pass.

### 1. Freeze and review the exact candidate

- Start from synchronized public `main` and identify one full candidate SHA.
- Ensure the candidate contains no private career content, credentials, sessions, provider output, generated local paths, or unreviewed runtime bytes.
- Review the complete diff and confirm `package.json` remains `0.1.0`, explicitly public only at `https://registry.npmjs.org/`, peer-only at runtime, and free of lifecycle/publication scripts.
- Confirm `src/`, `dist/index.js`, runtime manifest/provenance, package contents, supported targets, and the exact three native tools remain aligned.
- Do not move the candidate after its local and hosted evidence is recorded. Any content change creates a new candidate and requires the gate again.

### 2. Human native-license review

[`native-dependency-inventory.md`](native-dependency-inventory.md) records the exact 30-package normal/build Cargo graph, selected MIT texts for all 28 crates.io packages, the two Career Core workspace packages, Rust 1.97.1 Standard Library evidence, Unicode-3.0 requirement, target dynamic imports, and the Swift/UniFFI exclusion. `npm run check:native-licenses` enforces every packaged license/notice hash, inventory coordinate, target, provenance compiler version, and file boundary. This is evidence, not legal advice, an SPDX/CycloneDX SBOM, or self-approval.

Before publication, an independent human reviewer must:

- verify the inventory against Career Core commit `a3cdb4c6d7f966397e93ea4664071975bca7228c`, Cargo.lock SHA-256 `18d188cfea79128d4024dabe2e21f57e5d2098d32ffac8c4ef01243f49abb609`, and both per-target provenance records;
- confirm the documented MIT selections, exact grouped upstream texts/copyright notices, Rust Standard Library evidence, and Unicode License V3 payload satisfy the package-owned obligations for both native binaries;
- confirm the host-supplied dynamic-library boundary and that excluded Fuchsia/Swift/UniFFI dependencies are not part of either distributed target; and
- record an explicit approve/block decision without presenting the inventory as legal advice.

No npm publication, tag, or release may proceed while this independent review is absent or blocked. Any dependency, compiler, target, binary, provenance, or notice change invalidates the evidence and requires a fresh inventory and review.

### 3. Upstream artifact-expiry decision

The imported binaries and provenance remain tracked and hash-verified in this repository, but the original Career Core Actions artifacts were ephemeral:

| Artifact ID | Target | GitHub-reported expiry |
|---:|---|---|
| `8910079991` | `darwin-arm64` | `2026-08-07T21:43:37Z` |
| `8910084163` | `linux-x64-gnu` | `2026-08-07T21:43:47Z` |

Before npm publication, a human must recheck artifact availability and explicitly decide whether the tracked binaries, per-target provenance, manifest, archive identities/hashes, and public Core commit are sufficient durable provenance after expiry. If they are not sufficient, release stays blocked pending a separately approved preservation plan. This preparation does not download, copy, upload, recreate, or relabel either artifact.

### 4. Expiring development/host-Pi audit acceptance

`npm run audit:production` must pass with zero vulnerabilities at explicit `--audit-level=low`. It omits development, optional, and peer trees because the tarball owns no runtime dependency tree; strict package checks separately prove there is no `node_modules` or Pi package content and that exactly four wildcard peers remain external. The audit invokes `process.execPath` plus the absolute npm CLI derived from the real Node installation, verifies any inherited `npm_execpath`, and removes omit/include/audit-level/`NODE_ENV` overrides rather than trusting PATH-selected npm or caller-controlled tree/severity configuration.

The full `npm audit` is currently nonzero in the pinned development tool tree rooted at host-supplied Pi packages. This is temporarily accepted only through [`../audit/accepted-development-audit.json`](../audit/accepted-development-audit.json), which expires at `2026-08-19T00:00:00.000Z`. The acceptance covers only the exact report and installed tree under npm `10.9.3`: four vulnerable packages, nine advisory objects, their complete identities/details/severities/ranges/directness/node paths/fix metadata, all npm report metadata/counts, exact installed versions, and package-lock SHA-256 `7ff307f39cd2294e0ac4251f056d61e22785a36d81f325e7aa093e587ee64dec`.

This is a bounded development/host-Pi risk acceptance, **not a clean full audit**, a claim that another host Pi installation has the same tree, or a general waiver. `npm run check:accepted-development-audit` uses the same trusted npm coordinate and strict bounded JSON parsing. It must fail on or after expiry and on any package, installed version, advisory, severity, path, range, directness, fix data, metadata/count, npm-version, command, duplicate decoded key, malformed JSON, or lockfile drift. A newly clean full audit also requires explicit baseline retirement rather than being silently treated as the expected nonzero result.

`npm run check:publish` is the authoritative readiness gate but performs no publication. It is a direct Node orchestrator with no nested npm command and requires the strict production audit, exact unexpired development acceptance, and extracted package/load/install proof. Pack uses the trusted absolute npm CLI; listing and extraction use verified root-owned absolute `/usr/bin/tar`, never PATH-selected tools. Do not use `npm audit fix --force`, silently downgrade the Pi baseline, override or patch the published Pi shrinkwrap, hand-edit lock entries, extend the expiry, or regenerate the baseline mechanically. This preparation adds no Dependabot ignore policy; remediation may require a minor or major update.

### 5. Complete verification on the frozen SHA

Run with Node.js 22.19 or newer:

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
CAREER_CORE_FIXTURE_ROOT=/absolute/path/to/reviewed/career-core npm run test:compat
npm ls --omit=dev --depth=0
git diff --check
```

Requirements:

- `npm run build` may reproduce tracked `dist/index.js`; it must not alter runtime artifacts. The immediate dist diff must pass.
- All project/runtime/package/offline checks must pass, the runtime npm tree must remain empty, and `npm run check:publish` must pass before its fixed baseline expiry.
- Compatibility must execute against an explicitly reviewed fixture checkout; a skip is not release evidence.
- Preserve and disclose the exact temporary nonzero development audit acceptance without describing the full audit as clean.
- The exact final SHA must then pass both required hosted native jobs: `darwin-arm64` on macOS arm64 and `linux-x64-gnu` on Linux x64 glibc.

### 6. Finalize notes only after all other gates pass

This preparation intentionally leaves `CHANGELOG.md` under `Unreleased`. After every preceding gate passes, a separately reviewed finalization change must:

- convert the candidate notes to a dated `0.1.0` entry;
- preserve unsigned/not-notarized runtime caveats and the two supported targets;
- state that `pi-career@0.1.0` is the public npm package and that there is no crate publication or custom release asset; and
- state either that the accepted development/host-Pi baseline remains exact and unexpired, including its expiry and not-clean-full-audit caveat, or that a separately reviewed remediation retired the baseline.

A commit cannot contain its own Git SHA. After the finalization commit exists, record its full SHA in the GitHub Release notes and verify npm's `gitHead` against it. Only that separately authorized final commit may receive the annotated tag, npm publication, and GitHub Release.

## Manual release execution

After all blocking gates pass on the final clean commit and the maintainer explicitly authorizes execution:

1. Confirm `npm whoami` identifies the intended npm account and the registry is exactly `https://registry.npmjs.org/`. Never place an npm token or one-time password in repository files, Pi messages, logs, or release notes.
2. Reconfirm that `npm view pi-career@0.1.0 version --json` returns not found. A registry name check does not reserve the name.
3. Create and push the unsigned annotated `v0.1.0` tag for the exact final commit.
4. From Node 22.19.0/npm 10.9.3, publish once with lifecycle scripts disabled:

   ```bash
   npm publish --access public --tag latest --ignore-scripts
   ```

5. Verify `npm view pi-career@0.1.0 --json` reports the expected version, repository, four peers, tarball integrity, and `gitHead`; then perform an isolated `pi install npm:pi-career@0.1.0`, package load, bundled-runtime smoke, and removal on a supported target.
6. Create the GitHub Release from `v0.1.0`. State the full commit SHA, npm registry integrity, supported targets, unsigned/not-notarized binaries, no crate/custom assets, zero-vulnerability package-owned production audit, and exact temporary development/host-Pi acceptance with its expiry and not-clean caveat.

Do not sign, attach assets, change repository settings, publish another registry tag/version, or retry after an ambiguous registry response without first querying the registry. npm versions are immutable; a failed post-publication check is an incident, not permission to overwrite `0.1.0`.
