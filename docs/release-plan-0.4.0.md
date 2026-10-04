# pi-career 0.4.0 release record

**Status: released and immutable.** `pi-career@0.4.0` is published as `latest` from commit `31d1a8068ddff727cd7bb27e7546965def51e574`; the annotated unsigned `v0.4.0` tag and asset-free GitHub Release target that same commit. The complete local candidate ladder passed on 2026-10-04, including fixture parity against the exact reviewed Career Core `v0.2.0` checkout, and same-SHA hosted evidence passed before publication. The publication incident and recovery are recorded below and in [`releasing.md`](releasing.md). This historical record is not authorization to move or recreate the tag, rerun publication, republish the immutable npm version, or alter its GitHub Release.

## Version rationale and scope

The selected **0.4.0** version reflects the substantial additive, user-visible application-centric workflow: one shared Career overlay across TUI/RPC, persistent application catalog and attachment, workspace-backed current vacancy and selected-original authority, explicit lifecycle/revision handling, readiness presentation, and the separately approved user-authored cover-letter transaction. This is not a breaking change to the canonical application-state contract. It does not justify 1.0: boundaries and later workspace gates remain deliberately narrow.

The release scope is only the implemented application-centric experience recorded in the dated `CHANGELOG.md` 0.4.0 entry: one shared overlay and views; application create/catalog/attach; library-root add/rescan/remove; confirmation-gated analyze/match, vacancy edit, status update, and workspace management; workspace-backed vacancy/selected-original authority and lifecycle; derived readiness/next action; and user-authored cover-letter handling. Legacy identity-only migration remains exact-label, canonical-byte-previewed, separately confirmed, and no-clobber. Preserve the exact `career_run` primary managed tool, raw compatibility names, Core contract, local-first runtime boundary, consent/privacy/cancellation guarantees, and native-free package. Release claims must be checked against the final source rather than copied from this record.

### State and migration distinctions

Application-state revisions use the single canonical schema identifier `pi.career.application_state`. They have **no schema-version migration or compatibility reader**: former `.v1`/`.v2` and other unsupported identifiers fail closed, are not adopted/repaired/rewritten, and do not expose a trusted prefix. This is distinct from the separately versioned user configuration contract. Ordinary setup/mutations preserve canonical config v1; only the explicit application-root configuration flow can migrate config v1 to v2, after exact preview and separate user confirmation. Never imply that application-state changes migrate config, or that config migration converts application-state files. See [single application-state contract](single-application-state.md) and [workspace design](application-workspaces.md).

### Deferred / not part of 0.4.0

No inferred future scope: workspace resume artifacts and deletion, arbitrary files/browsing, adoption, repair, rebind, archive, synchronization, encryption/secure deletion, broad artifact formats, provider-response/result persistence, automated submission, model/provider behavior, telemetry, MCP, Windows, new native targets, runtime/Core upgrades, or application-state migration. Any later workspace gate requires its own review/authorization. The separate `/career-save` workflow remains distinct.

## Support claims (exact, no extrapolation)

- Node.js: `>=22.19.0` per package engine; do not advertise an upper tested range or a different minimum.
- Pi APIs: the README's exact claim is “1.0.0-compatible package APIs.” Development dependency pins are exact 1.0.2; they do not prove a broader tested compatibility range. Do not claim “Pi 1.0+” or infer newer/older versions.
- Career runtime: exact `@revazi/career@0.2.0`, managed Core 0.2.0 contract; not a range.
- Native targets, delegated to that reviewed launcher: `darwin-arm64`, `darwin-x64`, `linux-x64-gnu`, `linux-arm64-gnu`, `linux-x64-musl`, `linux-arm64-musl`. GNU Linux requires glibc 2.35+. No Windows or other target claim.

## Privacy, retention, and screenshots

All examples, UI captures, and render checks use synthetic labels/documents, synthetic paths, and disposable sessions/workspaces only. Never use real user records, credentials, provider responses, or session content. A screenshot/render review may cover compact/wide TUI layout, overlay navigation/empty state, and representative RPC dialogs; check wrapping, clipping, visible consent/confirmation, and absence of unintended private detail. Do not inspect or modify protected PNGs. Any new image must be generated from synthetic fixtures, separately reviewed for metadata/content, and added to the exact package allowlist only if intentionally packaged; no screenshot is required for the release.

Local documents and Pi sessions, RPC clients, editor history, backups/snapshots/sync, provider systems, and npm cache are distinct retention surfaces. Exact runtime acquisition receives no private document stdin, but ordinary npm cache or `_npx` residue may remain; this is not secure erasure. Do not promise cache cleansing or secure deletion. Existing privacy and persistence descriptions remain authoritative.

## Evidence matrix — completed release

The 2026-10-04 local results cover the bytes later frozen at `31d1a8068ddff727cd7bb27e7546965def51e574`. Hosted and registry evidence below is tied to that same immutable commit.

| Gate / evidence | Historical outcome |
| --- | --- |
| Release identity | Package, root lockfile entries, Skill metadata, package assertions, release helpers, README coordinate, and dated changelog identify 0.4.0; annotated unsigned tag `v0.4.0` and the asset-free GitHub Release target the frozen commit. |
| Build / dist reproducibility | Passed immediately after `npm run build` against the tracked bundles and again in the release gates. |
| Token and complete adapter checks | `bench:tokens`, `bench:tokens:compare`, and `check` passed locally; same-SHA Adapter run [`37191508057`](https://github.com/revazi/pi-career/actions/runs/37191508057) passed. |
| Exact Career package runtime integration | Passed locally with exact `@revazi/career@0.2.0`, including synthetic managed discovery and representative resume/job operations; same-SHA six-target run [`37191625998`](https://github.com/revazi/pi-career/actions/runs/37191625998) passed. |
| Production and full audits | Both passed with zero vulnerabilities at the explicit low threshold under exact Pi 1.0.2 development pins. No acceptance baseline was used. |
| Package/publication | `check:publish` passed and the native-free package was published through OIDC in run [`37191969844`](https://github.com/revazi/pi-career/actions/runs/37191969844). Registry integrity is `sha512-ks5xCnt2sDKCTzjvUuRQCJJSGaiHvt1lmwJNT6hhJLIV2MCmCrOUOG2dLW9uhdyGjHXR7Eu4SRlBXSNAVDtWpA==`; shasum is `460b9d69b42bc572bf966498a34c8818c3f26a6a`. |
| Fixture-backed compatibility | Passed, not skipped, against reviewed Career Core commit `536690632884c17336cc3c108f1bba0f254b862b` / `v0.2.0`; the fixture checkout remained read-only and local. |
| Offline and isolated package acceptance | Pre-release offline Pi load and isolated install/remove passed. After publication, an isolated agent-directory test passed exact install/list/load, acquisition, synthetic resume and job operations, offline failure, and removal. |
| Authoritative registry state | `pi-career@0.4.0` is immutable and `latest`; exact metadata, tarball bytes, `gitHead`, trusted publisher, provenance, and dist-tag were independently verified after propagation settled. |
| Publication incident and recovery | Run `37191969844` published successfully but failed during bounded post-publish registry verification. No rerun or republish occurred; the checked-in GitHub Release creator completed asset-free bookkeeping only after authoritative verification. |

The complete pre-release local ladder passed: `npm ci`; `npm run build` plus immediate candidate-relative dist comparison; `npm run bench:tokens`; `npm run bench:tokens:compare`; `npm run check`; `npm run test:runtime-resolution`; `npm run test:career-package`; `npm run audit:production`; `npm run audit:full`; `npm run check:publish`; `PI_OFFLINE=1 npm run test:pi-smoke`; `PI_OFFLINE=1 npm run test:install`; fixture-backed `npm run test:compat`; `npm ls --omit=dev --depth=0`; `git diff --check`. The exact Pi development pins remain 1.0.2, and the resolved vulnerable `brace-expansion@5.0.9` selection was absent. These are historical candidate and release results, not authorization for a new publication action.

## Historical publication path and immutable-release safeguards

The release used the sole publication path, [.github/workflows/release.yml](../.github/workflows/release.yml), triggered by the reviewed annotated unsigned `v0.4.0` tag:

- GitHub Actions trusted publisher was exactly `revazi/pi-career`, workflow `release.yml`, environment `npm`, with the protected `npm` environment enabled.
- The workflow granted `id-token: write` only to the publication job and used no long-lived npm token, `NPM_TOKEN`, `NODE_AUTH_TOKEN`, OTP, manual token publishing, or alternate workflow/path.
- Pinned checkout/setup-node actions, Node 22.19.0, exact npm 11.6.2, lifecycle-disabled dependency installation/publication, and provenance settings matched the reviewed workflow.
- Tag/version/changelog/lockfile/full SHA/annotated unsigned tag checks, same-SHA hosted gates, complete audits/package gates, and clean-tree checks passed before publication.
- The authoritative registry represented the trusted publisher's OIDC configuration as bare UUID `59e29379-4ad7-4ac5-8484-68bba66677fe`; the publisher name, email, and `github` provider ID remained exact.

### Registry-first and ambiguous-outcome rule

The authoritative registry reported `pi-career@0.4.0` absent before the one authorized publication. When the post-publication workflow result became ambiguous, maintainers did **not** rerun the workflow, republish, move/replace the tag, or attempt overwrite. They first inspected exact version metadata, dist-tag, tarball integrity/shasum, provenance/publisher identity, and `gitHead`. Because the exact package was present, recovery was limited to verification and GitHub Release bookkeeping with the existing checked-in helper. This rule remains mandatory: preserve evidence and stop if registry state is indeterminate; never treat a failed post-publication check as permission for an automatic retry or alternate publication channel.

## Recovery and post-release verification

`pi-career@0.4.0` cannot be overwritten or “rolled back” by republishing, and its tag must not move. Run `37191969844` exceeded the former registry propagation bound after successful publication; the now-authoritative registry metadata also used a bare UUID where the verifier expected the historical `oidc:` prefix. The package's exact identity and bytes were independently verified, so no rerun or republish occurred. The checked-in `scripts/create-github-release.mjs` then created the asset-free GitHub Release against the existing tag.

Independent verification proved npm integrity `sha512-ks5xCnt2sDKCTzjvUuRQCJJSGaiHvt1lmwJNT6hhJLIV2MCmCrOUOG2dLW9uhdyGjHXR7Eu4SRlBXSNAVDtWpA==`, shasum `460b9d69b42bc572bf966498a34c8818c3f26a6a`, exact `gitHead`, provenance and trusted publisher, `latest` dist-tag, tag/Release target, and absence of native or custom Release assets. In an isolated Pi agent directory, exact `npm:pi-career@0.4.0` install/list/load, runtime acquisition with synthetic resume and job operations, offline failure, and removal all passed. No production-wire claim is inferred from synthetic operation fixtures beyond acceptance of this exact published package.
