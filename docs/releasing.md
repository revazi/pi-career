# Release preparation

This document defines the smallest possible future `v0.1.0` release process. It is a checklist, not release authorization. The repository remains **Unreleased**: no tag, GitHub Release, npm/crate publication, custom release asset, signature, or notarization is claimed by this release-preparation change.

## Approved future channel boundary

If every gate below is closed and a maintainer separately authorizes release execution, the only planned channel is:

1. one annotated, unsigned `v0.1.0` Git tag pointing to the final reviewed commit; and
2. one GitHub Release containing notes derived from the finalized `CHANGELOG.md` entry.

The project will not publish to npm or crates.io, attach an npm-pack tarball or native binary, create any other custom release asset, or claim signing/notarization. GitHub will expose its automatically generated source archives; those archives contain the complete tracked tree, including both unsigned native binaries, and are not the strict allowlisted npm-pack artifact tested by `npm run check:package`.

A reviewed full commit SHA remains the canonical installation and audit coordinate. The release notes must state that SHA. A tag is a discovery label, not a substitute for immutable commit review, and README installation instructions must continue to use the full SHA.

There is no publication workflow. Release execution is manual and requires separate explicit authorization after the candidate commit and hosted checks are frozen.

## Blocking gates

Every item in this section blocks the future tag and GitHub Release. A skipped, unknown, or merely planned result is not a pass.

### 1. Freeze and review the exact candidate

- Start from synchronized public `main` and identify one full candidate SHA.
- Ensure the candidate contains no private career content, credentials, sessions, provider output, generated local paths, or unreviewed runtime bytes.
- Review the complete diff and confirm `package.json` remains `0.1.0`, `private: true`, peer-only at runtime, and free of lifecycle/publication scripts.
- Confirm `src/`, `dist/index.js`, runtime manifest/provenance, package contents, supported targets, and the exact three native tools remain aligned.
- Do not move the candidate after its local and hosted evidence is recorded. Any content change creates a new candidate and requires the gate again.

### 2. Human native-license review

[`native-dependency-inventory.md`](native-dependency-inventory.md) records the locked normal/build dependency graph used by `career-cli` for both bundled targets. It is evidence, not legal advice, an SPDX/CycloneDX SBOM, or approval to distribute.

Before release, a human reviewer must:

- verify the inventory against Career Core commit `a3cdb4c6d7f966397e93ea4664071975bca7228c`, Cargo.lock SHA-256 `18d188cfea79128d4024dabe2e21f57e5d2098d32ffac8c4ef01243f49abb609`, and the two per-target provenance records;
- inspect the actual license files and notices for every reachable locked package, choose any permitted license alternatives intentionally, and determine whether the package-bounded license/notice set satisfies all obligations for the native binaries;
- confirm that excluded Swift/UniFFI dependencies are not reachable from either distributed `career-cli` graph;
- verify that the required Unicode License V3 text for `unicode-ident 1.0.24` is preserved at [`licenses/Unicode-3.0.txt`](licenses/Unicode-3.0.txt); and
- record an explicit approve/block decision without presenting this repository's inventory as legal advice.

No tag or release may proceed while this human review is absent or blocked.

### 3. Upstream artifact-expiry decision

The imported binaries and provenance remain tracked and hash-verified in this repository, but the original Career Core Actions artifacts were ephemeral:

| Artifact ID | Target | GitHub-reported expiry |
|---:|---|---|
| `8910079991` | `darwin-arm64` | `2026-08-07T21:43:37Z` |
| `8910084163` | `linux-x64-gnu` | `2026-08-07T21:43:47Z` |

Before release, a human must recheck artifact availability and explicitly decide whether the tracked binaries, per-target provenance, manifest, archive identities/hashes, and public Core commit are sufficient durable provenance after expiry. If they are not sufficient, release stays blocked pending a separately approved preservation plan. This preparation does not download, copy, upload, recreate, or relabel either artifact.

### 4. Unresolved development-advisory review

`npm run audit:runtime` must pass with zero runtime npm vulnerabilities. That narrow result must not be described as a clean full audit.

The release-preparation baseline has an unresolved nonzero full `npm audit` result in the pinned development/peer tool tree rooted at `@earendil-works/pi-coding-agent`, including `undici`, `brace-expansion`, and `protobufjs` advisories. Before release, rerun the full audit and require one of:

- a compatible, reviewed, lockfile-pinned upstream remediation that passes all project checks; or
- an explicit human advisory-by-advisory risk acceptance scoped to build/test tooling, with the runtime-empty dependency boundary and mitigations recorded.

Do not use `npm audit fix --force`, silently downgrade the Pi baseline, or call the full audit passing while it exits nonzero. Dependabot policy suppresses incompatible baseline version churn only; patch version updates and security updates remain enabled.

### 5. Complete verification on the frozen SHA

Run with Node.js 22.19 or newer:

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
CAREER_CORE_FIXTURE_ROOT=/absolute/path/to/reviewed/career-core npm run test:compat
npm ls --omit=dev --depth=0
npm audit
git diff --check
```

Requirements:

- `npm run build` may reproduce tracked `dist/index.js`; it must not alter runtime artifacts. The immediate dist diff must pass.
- All project/runtime/package/offline checks must pass and the runtime npm tree must remain empty.
- Compatibility must execute against an explicitly reviewed fixture checkout; a skip is not release evidence.
- Preserve the exact nonzero full-audit output for the human advisory gate rather than masking it.
- The exact final SHA must then pass both required hosted native jobs: `darwin-arm64` on macOS arm64 and `linux-x64-gnu` on Linux x64 glibc.

### 6. Finalize notes only after all other gates pass

This preparation intentionally leaves `CHANGELOG.md` under `Unreleased`. After every preceding gate passes and before creating a tag, a separately reviewed finalization change must:

- convert the candidate notes to a dated `0.1.0` entry;
- state the canonical full release commit SHA;
- preserve unsigned/not-notarized runtime caveats and the two supported targets;
- state that there is no npm/crate package and no custom release asset; and
- disclose any approved residual development-advisory risk accurately.

Only the separately authorized final commit may receive the annotated tag and GitHub Release notes. Do not sign, publish assets, change repository settings, or create the tag/release as part of a preparation PR.
