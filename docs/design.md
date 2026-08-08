# Self-contained package design and threat model

## Scope and authority

`pi-career` is a self-contained public npm and Git Pi package on two reviewed native targets. It owns the Pi extension, package-owned native runtime artifacts and resolver, Pi-facing Agent Skill, package/build tests, and installation guidance. Career Core remains authoritative for operations, schemas, algorithms, errors, evidence, warnings, uncertainty, ordering, and assisted/non-authoritative semantics; this repository does not reimplement those contracts in TypeScript.

The stable Pi surface is exactly:

- `career_core_discover`
- `career_core_resume`
- `career_core_job`

The TypeScript source is authoritative. Checked-in deterministic `dist/index.js` and `dist/pdf-worker.js` bundles support clean local, pinned-Git, and npm Pi loading without runtime dependencies. The isolated worker bundles the reviewed PDF text extractor; Pi-provided imports remain external peers. Reviewed native artifacts are tracked directly in every package channel so installation needs no lifecycle script, Cargo, Rust, system `career` executable, or post-install runtime download. Package metadata permits only reviewed public publication of the unscoped `pi-career` package to the canonical npm registry.

The workflow layer registers `/career-setup`, `/career-library`, `/career-application`, `/career-vacancy`, `/career-match`, `/career-analyze`, and `/career-workbench`. `/career-setup` also records or derives a suggestion-only preferred variation directory without creating it or authorizing file writes. `/career-vacancy`, `/career-match`, and `/career-analyze` call the shared `invokeCareerCli` helper directly; setup/library scanning remains local. None of these deterministic commands route through an LLM-facing tool, provider, model, network, PATH, Cargo, sibling checkout, or downloaded runtime. `/career-application` owns only branch-aware, consented company/role identity and scopes later vacancy/result entries without creating files. `/career-workbench` performs no provider/model call: it builds a bounded, visibly reviewable ordinary Pi editor prompt from one selected original and, only for tailoring, the current vacancy. Its guided modes instruct the selected agent, after submission, to rerun the complete deterministic baseline and use the corresponding Core suggestion, replacement, or variant review. The question-led rewrite mode reviews first, asks one bounded batch of user-verifiable factual questions, and waits for a later turn before drafting or reviewing replacements. Review prompts require verbatim preferably single-line targets, make one review attempt without model-led repair/retry, and avoid repeating unchanged review-embedded baselines in prose while leaving complete tool JSON authoritative. Non-PDF variant materialization is deferred to a later turn after explicit canonical change-ID selection; PDF output stops at targeted manual changes. Nothing leaves the package until the user separately submits that editor message through Pi. See [`product-flow.md`](product-flow.md) for the phase boundary and [`application-workspaces.md`](application-workspaces.md) for company/role isolation and the separately reviewed private-file persistence plan.

## Runtime provenance and selection

[`../runtime/manifest.json`](../runtime/manifest.json) pins unsigned artifacts from Career Core commit `a3cdb4c6d7f966397e93ea4664071975bca7228c` and native artifact run [30953471793](https://github.com/revazi/career-core/actions/runs/30953471793). It records exact binary/provenance paths, target triples, sizes, modes, SHA-256 values, source archive identities, shared notices, and bounded capabilities/schema/representative-operation digests. Imported per-target provenance remains package-bounded.

Resolution order is fixed:

1. A bounded absolute `CAREER_CLI_PATH`, when explicitly set for reviewed development/recovery use.
2. The verified package-owned binary for the current supported target.
3. Otherwise a stable payload-free failure.

There is no PATH, Cargo, sibling-checkout, download, npm platform-package, or install-script fallback.

Supported targets are exactly:

- `darwin-arm64` (`aarch64-apple-darwin`)
- `linux-x64-gnu` (`x86_64-unknown-linux-gnu`, only when Node reports glibc)

Windows, macOS x64, Linux arm64, Linux musl, and unknown libc/platform combinations fail closed as `unsupported_platform`.

Before the first bundled spawn per process, the resolver rejects symlinks/non-files, requires exact `0755` mode and size, reads the bounded binary, and verifies SHA-256. Only successful verification is cached in memory. Selection/integrity errors expose no platform details, paths, hashes, environment values, or raw filesystem failures.

## Process boundary

The adapter calls `spawn(executable, argv, { shell: false })`; operations and schema IDs are bounded before spawn. Document JSON is one bounded object string sent only through child stdin with `--input - --format json-compact`.

The process adapter creates no payload/result temporary files and adds no network, model, provider, telemetry, repair, retry, or URL-fetching behavior. The workflow layer may read configured `.pdf`/`.md`/`.txt` roots, atomically persist non-content global config—including one bounded preferred variation-directory suggestion—and append consented custom session entries, but it does not change the Career Core child-process boundary. Searchable PDF text is extracted from bounded in-memory bytes in a package-owned worker with fixed page, time, result, and memory ceilings; network fetch is disabled before the parser loads, the worker emits only text or a generic failure, and it is terminated after each document. A successful child must emit exactly one UTF-8 JSON object, no stderr, and a complete result within capture and Pi-context ceilings. Authoritative output is never truncated. A successful bounded workflow result can be inspected completely through a transient read-only pager that wraps long lines and keeps at most 20 detail lines visible; it is not appended to session state or written to a file. Oversized process results fail without partial output, and pi-career has no full-result file export.

## Threat model

| Threat | Mitigation |
|---|---|
| Shell or argument injection | Fixed allowlisted operation mappings, bounded schema-ID syntax, direct argv-only spawn, `shell: false`, document bytes on stdin only. |
| Executable substitution | Override is explicit, absolute, and bounded. Default runtime path is package-fixed; no PATH/sibling/Cargo fallback exists. |
| Bundled artifact corruption or target swap | Exact runtime allowlist, regular-file and executable-mode checks, target binary magic, manifest/provenance/source-run lock, size and SHA-256 verification before first spawn. |
| Unsupported platform/libc guessed as compatible | Exact platform/arch selection and positive glibc detection; every other combination fails `unsupported_platform`. |
| Oversized request, stream, diagnostic, or context | UTF-8 byte bounds before spawn, independent stdout/stderr ceilings, fixed timeout, 50,000-byte/2,000-line complete-result limits, fail closed without truncation. |
| Hung or cancelled child | Abort propagation and fixed timeout send `SIGTERM`, then `SIGKILL` after a bounded grace period; settlement waits for close. |
| Malformed, ambiguous, or multiple output documents | Fatal UTF-8 decoding and exact-one-object JSON validation. |
| Private payload disclosure in failures | Raw stderr, process/filesystem errors, input/output, paths, hashes, platform details, and environment values never cross adapter errors or logs. Only strictly shaped, bounded, allowlisted `career.error.v1` values may be nested. |
| Untrusted or non-searchable PDF | Only regular in-root files up to 10 MiB are transferred to a resource-limited package worker. Parsing has 20-page, 10-second, and 512-KiB extracted-result ceilings; eval, WASM, streaming, auto-fetch, system fonts, and network fetch are disabled. Empty, malformed, encrypted, image-only, oversized, or timed-out documents fail with an actionable generic notice and never reach Career Core. OCR is not attempted. |
| Workflow persistence leaks or races | Global config contains canonical roots/labels plus at most one bounded absolute variation-directory suggestion, uses a `0700` directory and atomic `0600` file, and never stores source text or Core output. The destination is suggestion-only and no package command creates it or writes a resume. Session state uses branch-aware custom entries excluded from LLM context; application IDs scope vacancy/result reconstruction, and the workflow requires `/new` before another company/role so prior private prompts cannot remain in the next application conversation. Full Core JSON is never stored. |
| Pi session persistence mistaken for adapter persistence | Persisted workflow sessions require the exact local-persistence decision before private vacancy or card entries and before preparing a private workbench prompt. Transient sessions receive a notice. The workbench prompt visibly contains the complete source context; if submitted, Pi may save it as a normal user message and send it to the selected provider. This is not secure erasure and local-session approval is not provider consent. |
| Adapter changes Core authority | Successful JSON is returned complete and unchanged apart from removing one framing newline. Discovery-first skill guidance preserves evidence, warnings, uncertainty, baseline boundaries, and assisted labels. |
| Hidden external behavior | Workflow and runtime sources contain no fetch, provider, credential, telemetry, MCP, or model invocation. Deterministic commands invoke only the package-owned process helper; the workbench only fills Pi's editor and explicitly states that submitting is the separate provider disclosure action. No-model/offline smokes enforce the surface. |
| Supply-chain or packaging drift | Exact Core source/run provenance, lockfile-pinned development tools, npm derived from the real Node installation instead of `PATH`, inherited `npm_execpath` verification, npm tree/severity environment sanitization, duplicate-key-rejecting bounded JSON, verified absolute system tar, four wildcard external peers, tracked deterministic bundle, runtime/package allowlists and limits, zero low-threshold production and full audits, native CI execution on each claimed target, and extracted isolated install acceptance. |

## Build, package, and CI boundary

`npm run build` rebuilds only `dist/index.js` and `dist/pdf-worker.js`; native artifacts are never built or downloaded implicitly. Runtime refresh requires a separate approved native artifact workflow and manifest review.

Package checks allow only reviewed docs, extension/skill files, and the eight runtime files. They invoke npm through `process.execPath` plus its derived absolute CLI and invoke verified root-owned `/usr/bin/tar`, never a PATH-selected npm/tar. They enforce the exact public npm registry/access metadata, compressed/unpacked bounds, modes, hashes, provenance, the reviewed bundled PDF extractor and license notice, no packaged `node_modules` or Pi package contents, no package-owned runtime npm dependencies, exactly four wildcard external peers, and no lifecycle or publication scripts. The extracted package must load, execute the current target with `CAREER_CLI_PATH` unset and an empty `PATH`, and pass an isolated Pi install/list/remove smoke.

Hosted CI uses native Ubuntu x64 GNU and macOS arm64 runners. Both run the tracked-dist stale gate, process/runtime/audit tests, complete artifact/package checks, real bundled discovery and representative resume/job operations, no-model load, isolated install, strict low-threshold `audit:production`, and the authoritative readiness-only `check:publish`. The latter is a direct Node orchestrator rather than nested npm scripts and requires clean production and full development/host-Pi audits. Both remove omit/include/audit-level/`NODE_ENV` overrides and strictly reject duplicate decoded JSON keys; no audit-acceptance baseline is allowed. Hosted tests require no separate Core checkout or provider credential.

## Installation boundary

A normal supported-target user registers a reviewed clean absolute local path, the public Git URL pinned to a full reviewed commit, or `npm:pi-career` pinned to an exact reviewed version. Pi local paths follow changing files; pinned Git refs and npm versions require an explicit new coordinate. Removal only unregisters the package and does not erase Pi sessions, shell history, backups, or separately saved results.

`CAREER_CLI_PATH` is not an onboarding requirement. A caller choosing it assumes review/compatibility responsibility for that executable; the same argv/stdin, bounds, cancellation, and error boundary still applies.

## Provenance

The initial process adapter, tool mappings, synthetic fake executable, process tests, and skill guidance were adapted from Career Core commit `100774ed8bb3b39c019d64ce105af1e3f209144f`. Bundled runtime artifacts and their metadata were imported from exact Core commit `a3cdb4c6d7f966397e93ea4664071975bca7228c` via the reviewed native artifact run. This repository preserves the applicable `MIT OR Apache-2.0` terms and package-bounded notices in `NOTICE` and `runtime/`.
