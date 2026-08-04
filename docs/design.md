# Standalone package design and threat model

## Scope and authority

`pi-career` is a private, standalone Pi package. It owns only the Pi extension, Pi-facing Agent Skill, package/build tests, and installation guidance. The independently installed `career` executable remains authoritative for operations, schemas, algorithms, errors, evidence, warnings, uncertainty, ordering, and assisted/non-authoritative semantics. This repository does not copy Core algorithms or the embedded schema catalog.

The stable Pi surface is exactly:

- `career_core_discover`
- `career_core_resume`
- `career_core_job`

The TypeScript source is authoritative. A small checked-in `dist/index.js` bundle supports clean local and pinned-Git Pi installation without runtime developer dependencies. Pi-provided imports remain external peer dependencies. Rebuilding the bundle twice and comparing bytes gates reproducibility; package-content tests gate the installable artifact.

## Process boundary

The adapter resolves `career` from `PATH`, unless `CAREER_CLI_PATH` is a bounded absolute path. It calls Node `spawn(executable, argv, { shell: false })`; operations and schema IDs are bounded before spawn. Document JSON is one bounded object string sent only through child stdin with `--input - --format json-compact`.

The adapter creates no payload/result temporary files, invokes no Cargo fallback, and adds no network, model, provider, UI, telemetry, persistence, repair, retry, or URL-fetching behavior. A successful child must emit exactly one UTF-8 JSON object, no stderr, and a complete result within the capture and Pi-context ceilings. Authoritative output is never truncated.

## Threat model

| Threat | Mitigation |
|---|---|
| Shell or argument injection | Fixed allowlisted operation mappings, bounded schema-ID syntax, direct argv-only spawn, `shell: false`, document bytes on stdin only. |
| Executable substitution | Default is the caller's installed `career` on `PATH`; override must be a bounded absolute path. No sibling checkout or Cargo fallback is consulted. |
| Oversized request, stream, diagnostic, or context | UTF-8 byte bounds before spawn, independent stdout/stderr ceilings, fixed timeout, 50,000-byte/2,000-line complete-result limits, fail closed without truncation. |
| Hung or cancelled child | Abort propagation and fixed timeout send `SIGTERM`, then `SIGKILL` after a bounded grace period; settlement waits for process close. |
| Malformed, ambiguous, or multiple output documents | Fatal UTF-8 decoding and exact-one-object JSON validation. |
| Private payload disclosure in failures | Raw stderr, process errors, input/output, paths, and environment values never cross adapter errors or logs. Only strictly shaped, bounded, allowlisted `career.error.v1` values may be nested in an adapter error. |
| Adapter-side persistence | No extension state and no payload/result file writes. Tests use synthetic data and temporary test-only roots. |
| Pi session persistence mistaken for adapter persistence | Documentation requires an explicit decision before private document use and recommends a new `pi --no-session` run. It makes no secure-erasure claim and does not treat local-session approval as provider consent. |
| Adapter changes Core authority | Successful JSON is returned complete and unchanged apart from removing one framing newline. The skill requires capability/schema discovery and exact preservation of evidence, warnings, uncertainty, baseline boundaries, and assisted labels. |
| Hidden external behavior | Runtime imports only Node process/buffer utilities plus Pi-provided peers. No `fetch`, provider, credential, telemetry, MCP, or model runtime exists. A no-model offline resource-loader smoke enforces the package surface. |
| Supply-chain or packaging drift | Lockfile-pinned development tools, externalized peers, tracked reproducible bundle, explicit package allowlist, secret/link scans, and isolated install/list/remove acceptance. |

## Installation boundary

A maintainer first verifies an installed compatible `career` with `career --version`, `career capabilities --format json-compact`, and schema discovery. Pi can then register either a reviewed absolute local path or a private Git URL pinned to a commit. Local paths are referenced in place; pinned Git updates require installing a reviewed new commit. Removal only unregisters the package and does not erase Pi sessions, shell history, backups, or separately saved results.

## Provenance

The initial process adapter, tool mappings, synthetic fake executable, process tests, and skill guidance are adapted from Career Core commit `100774ed8bb3b39c019d64ce105af1e3f209144f`. That source remains available under `MIT OR Apache-2.0`; this repository preserves the same dual-license terms and records the source in `NOTICE`.
