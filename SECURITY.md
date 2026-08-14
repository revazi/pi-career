# Security and privacy

## Reporting

Do not open an ordinary issue with vulnerability details. Use a private Security-tab reporting/advisory route when available; otherwise contact the maintainer through an already agreed private channel. Do not include resume text, job descriptions, credentials, executable paths, Pi sessions, hashes, environment values, npm output, or raw process diagnostics in a report.

## External runtime boundary

pi-career packages no native Career Core binary and has no runtime npm dependency or lifecycle script. It supports only macOS and Linux. On an unsupported platform, extension initialization registers no command or tool and fails with one stable payload-free `unsupported_platform` error before explicit/PATH resolution, package validation, acquisition, compatibility probing, or private stdin. On supported platforms, resolution order is fixed:

1. bounded absolute `CAREER_CLI_PATH`;
2. `career` on PATH;
3. package-local exact `@revazi/career@0.2.0`;
4. bounded acquisition of exact `@revazi/career@0.2.0` from the canonical npm registry;
5. stable payload-free installation guidance.

There is no sibling-checkout, Cargo, source-build, arbitrary executable download, or unpinned package fallback. `PI_OFFLINE=1` disables acquisition. A successful route is cached only in memory and invalidated when `CAREER_CLI_PATH` or `PATH` changes. An invalid explicit override fails without fallback.

Every caller-controlled route must pass the exact managed Core 0.2.0 operation catalog and required self-contained schema bundles before private stdin opens. Compatibility probes contain no private document input. An automatically selected executable that later fails before its operation emits `spawn` may advance once; cancellation, timeout, and any already-started operation never retry another route.

The package-local/acquired `@revazi/career` launcher is invoked directly with the real Node executable. Pi-career validates its exact v2 manifest, including the ordered six-package lockstep optional-dependency map, declared file allowlist, and `career` bin. The launcher owns native target/libc, package provenance, regular-file type and mode, size, format, architecture, and SHA-256 checks for pi-career's six supported macOS/Linux targets; pi-career does not duplicate those native verification algorithms.

Acquisition invokes the npm CLI derived from the real Unix `process.execPath` installation, rejects ambiguous/conflicting `npm_execpath`, sanitizes npm tree/registry/script-shell overrides, pins `/bin/sh` and the canonical registry/package/version, includes optional native packages, and disables scripts. It never invokes PATH-selected npm/npx. Acquisition receives no private stdin, has fixed timeout/stdout/stderr bounds, and uses detached Unix process-group termination for descendants. npm cache and `_npx` data may remain afterward; this is not secure erasure.

## Process and data boundary

The selected route is invoked through direct argv-only `spawn` with `shell: false`. For package routes, the real Node command receives the validated launcher as a fixed prefix. Document JSON is bounded and parsed as one object before spawn, appears only on stdin with `--input -`, and is not written until the successful `spawn` event.

The process adapter creates no career payload/result temporary file and performs no model, provider, credential, URL-fetching, telemetry, MCP, or repair behavior. The sole network-capable runtime action is exact-package acquisition before private stdin opens. It enforces timeout/cancellation cleanup, independent stdout/stderr ceilings, fatal UTF-8 decoding, exact-one-object success, no success diagnostics, and complete-result context bounds. Oversized authoritative results fail rather than truncate.

`/career-vacancy`, `/career-match`, and `/career-analyze` use the same helper; setup/library scanning and application state remain local. `/career-workbench` does not call a provider, model, or Core process; it only prepares a bounded ordinary Pi editor message containing selected private source. Nothing is sent automatically. If submitted, Pi may persist it and send it to the selected provider.

Global config stores only canonical root paths, bounded labels, and an optional variation-directory suggestion in an agent-directory-relative `0700` directory with atomic `0600` writes. Scans are bounded, UTF-8 strict, and symlink-free. Searchable PDFs are limited to 10 MiB and 20 pages and parsed in a package-owned worker with fixed time, memory, and result ceilings. Network fetch, eval, WASM, streaming, auto-fetch, and system-font lookup are disabled; OCR is not performed. Source text and full Core results are never written to global config or logs.

Only a strictly shaped, bounded, allowlisted `career.error.v1` may cross a known nonzero Core failure. Other failures expose stable payload-free `career.pi_error.v1`. Runtime code must not log or expose source/result text, raw errors, stderr, executable paths, hashes, platform details, environment values, npm diagnostics, or credentials.

## Pi session boundary

Pi may store tool arguments/results and workflow custom entries in session JSONL. Keep one company/role application per Pi session and use `/new` before another application. Before persisted private workflow state or workbench text is prepared, the workflow requires an explicit local-persistence decision. Custom workflow entries do not enter LLM context, and full Core JSON is not stored. Direct private raw-tool use still requires an explicit decision. Prefer a transient run when persistence is not wanted:

```bash
pi --no-session
```

This is not secure erasure and does not remove shell history, npm cache, backups, earlier Pi sessions, provider copies, or separately saved results. Consent to local Pi context is not consent to send content to an external provider.

## Installation and supply chain

Pi packages execute with the user's permissions. Install only a reviewed clean local checkout, public Git source pinned to a reviewed full commit, or public npm package pinned to an exact reviewed version. Review the tracked TypeScript bundle, external resolver, package allowlist, registry metadata, and native package CI/provenance. Normal pi-career installation declares `os: ["darwin", "linux"]` and has no npm lifecycle script, post-install runtime download, Cargo/Rust build, packaged native artifact, or production/optional runtime dependency. The generated PDF worker contains lockfile-pinned `unpdf` 1.8.0 and its included license notice.

`npm run audit:production` and `npm run audit:full` must both report zero vulnerabilities at explicit `--audit-level=low`. Audit and pack checks derive npm from real Node, verify inherited `npm_execpath`, remove tree/severity overrides, and reject duplicate decoded JSON keys. Package extraction uses verified root-owned `/usr/bin/tar`. The package check proves the tarball has no `runtime/`, native binary, `node_modules`, or Pi package contents and declares exactly four wildcard external peers. `check:publish` performs no publication.

A local-path registration follows later filesystem changes. Uninstalling pi-career only unregisters it; it does not erase npm cache, external Career packages, Git clones, Pi sessions, shell history, backups, or documents.
