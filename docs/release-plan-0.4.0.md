# pi-career 0.4.0 release candidate

**Status: release-candidate metadata finalized; not a release-execution authorization.** Package and lockfile metadata, Skill metadata, the dated changelog, package assertions, release helpers, and README installation coordinate identify `0.4.0`. The complete local candidate ladder passed on 2026-10-04, including fixture parity against the exact reviewed Career Core `v0.2.0` checkout. The immutable candidate SHA is established only by the reviewed commit and is recorded externally rather than embedded self-referentially in tracked files. Tag creation, publication, and GitHub Release creation require clean same-SHA hosted evidence and separate explicit authorization.

## Version rationale and scope

The selected **0.4.0** version reflects the substantial additive, user-visible application-centric workflow: one shared Career overlay across TUI/RPC, persistent application catalog and attachment, workspace-backed current vacancy and selected-original authority, explicit lifecycle/revision handling, readiness presentation, and the separately approved user-authored cover-letter transaction. This is not a breaking change to the canonical application-state contract. It does not justify 1.0: boundaries and later workspace gates remain deliberately narrow.

The candidate scope is only the implemented application-centric experience recorded in the dated `CHANGELOG.md` 0.4.0 entry: one shared overlay and views; application create/catalog/attach; library-root add/rescan/remove; confirmation-gated analyze/match, vacancy edit, status update, and workspace management; workspace-backed vacancy/selected-original authority and lifecycle; derived readiness/next action; and user-authored cover-letter handling. Legacy identity-only migration remains exact-label, canonical-byte-previewed, separately confirmed, and no-clobber. Preserve the exact `career_run` primary managed tool, raw compatibility names, Core contract, local-first runtime boundary, consent/privacy/cancellation guarantees, and native-free package. Release claims must be checked against the final source rather than copied from this proposal.

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

## Evidence matrix — prepared local candidate

The 2026-10-04 results below cover the prepared candidate content before its SHA is frozen. They are local release-candidate evidence, not production-wire acceptance and not a substitute for externally recorded same-SHA hosted evidence on the final reviewed commit.

| Gate / evidence | Current classification | Remaining release requirement |
| --- | --- | --- |
| Candidate identity | Package, root lockfile entries, Skill metadata, package assertions, release helpers, README coordinate, and dated changelog all identify 0.4.0. | Freeze the reviewed bytes once and record the resulting full SHA externally without adding a self-referential placeholder to tracked files. |
| Build / dist reproducibility | Passed immediately after `npm run build` against a temporary-index snapshot of the prepared candidate's tracked bundles. | On the clean committed SHA, run the standard immediate `git diff --exit-code -- dist/index.js dist/pdf-worker.js` proof. |
| Token and complete adapter checks | `bench:tokens`, `bench:tokens:compare`, and `check` passed locally. | Require the protected same-SHA `Adapter checks` result after commit/push. |
| Exact Career package runtime integration | Passed locally with exact `@revazi/career@0.2.0`, including synthetic managed discovery and representative resume/job operations. | Require the same-SHA six-target hosted matrix; this local result is not production-wire evidence. |
| Production and full audits | Both passed with zero vulnerabilities at the explicit low threshold under exact Pi 1.0.2 development pins. | No baseline, exception, dependency downgrade, or lockfile workaround is permitted. |
| Package/publication readiness | `check:publish` passed; the candidate remains native-free with four wildcard Pi peers and no production/optional/bundled dependency tree or lifecycle/publication script. | Rerun on the clean committed candidate and in the authorized release workflow. |
| Fixture-backed compatibility | Passed, not skipped, against reviewed Career Core commit `536690632884c17336cc3c108f1bba0f254b862b` / `v0.2.0`. | Keep the fixture checkout read-only and local; do not add its machine path to runtime code or hosted CI. |
| Offline Pi load and isolated install/remove | Both passed locally with `PI_OFFLINE=1`. | Preserve the offline no-acquisition boundary. |
| Registry state | Canonical registry query confirmed `pi-career@0.4.0` absent. | Reconfirm authoritative absence immediately before any first, separately authorized publication attempt. |
| Hosted candidate evidence | Intentionally external to the tracked candidate so evidence cannot change its SHA. | Require same-SHA `Adapter checks`, then dispatch `external-career.yml` on that exact ref and require all six jobs before release authorization. |

The complete local ladder passed: `npm ci`; `npm run build` plus immediate candidate-relative dist comparison; `npm run bench:tokens`; `npm run bench:tokens:compare`; `npm run check`; `npm run test:runtime-resolution`; `npm run test:career-package`; `npm run audit:production`; `npm run audit:full`; `npm run check:publish`; `PI_OFFLINE=1 npm run test:pi-smoke`; `PI_OFFLINE=1 npm run test:install`; fixture-backed `npm run test:compat`; `npm ls --omit=dev --depth=0`; `git diff --check`. The exact Pi development pins remain 1.0.2, and the resolved vulnerable `brace-expansion@5.0.9` selection is absent. Any content change after this evidence requires the affected gates again; after the candidate is committed, the standard clean-SHA local and hosted gates remain mandatory.

## Exact publication-path checklist (future authorized execution only)

The sole publication path remains existing [.github/workflows/release.yml](../.github/workflows/release.yml), triggered only by reviewed annotated unsigned `v*.*.*` tags. Before any separately authorized tag action, verify against the exact workflow and maintainer-controlled configuration:

- GitHub Actions trusted publisher is exactly `revazi/pi-career`, workflow `release.yml`, environment `npm`; protected `npm` environment is enabled.
- Workflow grants `id-token: write` only to the publication job and uses that `npm` environment; no long-lived npm token, `NPM_TOKEN`, `NODE_AUTH_TOKEN`, OTP, manual token publishing, or alternate workflow/path exists.
- Pinned checkout/setup-node actions, Node 22.19.0 release host, exact npm 11.6.2 tooling, lifecycle-disabled dependency installation/publication, and provenance settings match the reviewed workflow.
- Tag/version/changelog/lockfile/full SHA/annotated unsigned tag checks, same-SHA hosted gates, complete audits/package gates, and clean-tree checks all pass before publish. The workflow alone may publish and create the GitHub Release, only after registry verification.
- Trusted publisher/environment configuration is verified before release authorization; do not alter repository/npm settings as part of candidate preparation.

### Registry-first and ambiguous-outcome rule

Immediately before any first publish, query the authoritative registry explicitly: `npm view pi-career@0.4.0 version --json` against `https://registry.npmjs.org/`. It must report absence before a first publish. For any failed, timed-out, or ambiguous publish response, do **not** blindly rerun the workflow, republish, move/replace the tag, or attempt overwrite. First query authoritative registry state and inspect exact version metadata, dist-tag, tarball integrity/shasum, provenance/publisher identity, and `gitHead`; preserve evidence and stop if indeterminate. If the exact package is already present, recovery is verification/bookkeeping only through the approved workflow after explicit maintainer incident authorization; never republish immutable version. If absent, investigate and obtain explicit authorization before a controlled retry, following the existing release procedure. No alternate publish channel.

## Rollback, recovery, and post-release verification

Before publication, rollback is simply stop: leave the tag and registry untouched, fix the candidate in a reviewed commit, and rerun all gates on the new SHA. A bad published package cannot be overwritten or “rolled back” by republishing; stop installation promotion, document the incident, and use npm's immutable-version policy plus maintainer-directed deprecation/communication only after verifying authoritative state. Do not move a tag or fabricate a replacement artifact. A post-publication failure is an incident, not permission to retry.

After successful workflow completion, independently verify the exact npm version's registry metadata and tarball integrity/shasum, provenance and trusted publisher, `gitHead` against full candidate SHA, `latest` dist-tag, annotated tag target, asset-free GitHub Release target/notes, and main CI. In an isolated Pi agent directory install exact `npm:pi-career@0.4.0`, list/load, exercise synthetic runtime operation/acquisition and `PI_OFFLINE=1` failure, then remove the exact installed package. Confirm no native assets/custom Release assets and no unexpected package contents. Triage failures as release blockers/incidents in #73; record the observed Pi 1.0.2 remediation for #149, keep fixture-parity blockers visible, and open focused issues for any newly discovered defect without broadening support claims.
