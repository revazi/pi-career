# External runtime contract reference

Use this reference only after reading the parent skill. Career Core remains authoritative; pi-career validates its managed operation catalog and self-contained schema bundles rather than copying Core algorithms or public schemas.

## Runtime selection

Resolution order is fixed:

1. bounded absolute `CAREER_CLI_PATH`;
2. `career` on PATH;
3. package-local exact `@revazi/career@0.1.0`;
4. acquisition of exact `@revazi/career@0.1.0` from the canonical npm registry;
5. stable installation guidance.

There is no sibling-checkout, Cargo, source-build, lifecycle-script, arbitrary download, PATH-selected npm/npx, or unpinned package fallback. `PI_OFFLINE=1` disables acquisition. A route is cached only in memory and invalidated when `CAREER_CLI_PATH` or PATH changes. npm acquisition may leave ordinary cache/`_npx` data and does not provide secure erasure.

Every caller-controlled route must pass the exact Core 0.1.0 operation catalog and required self-contained schema bundles before private stdin opens. An invalid explicit override never falls back. Compatibility probes contain no private document input. If a cached automatic executable later fails before its operation emits `spawn`, pi-career may advance once; cancellation, timeout, and any started operation never retry another route.

Package-local/acquired routes invoke the reviewed package launcher directly with the real Node executable. The launcher owns native target/libc, package/provenance mapping, mode, size, format, and SHA-256 verification. Its reviewed targets are `darwin-arm64` and `linux-x64-gnu`.

## Managed discovery

`career_run` internally invokes and caches only non-sensitive metadata from:

- `career operations --format json-compact`
- `career schema bundle --id <required-input-schema> --format json-compact`

The adapter requires exact `career.operation_catalog.v1` capability mappings, CLI paths, transports, input/output schemas, byte ceilings, and all-local bundle references. Incompatibility fails closed. These bootstrap results are not exposed to the model during the normal managed flow.

Every successful machine JSON result is completely serialized by Core before stdout and bounded to 33,554,432 bytes including framing. Managed execution captures the complete result in bounded ephemeral memory, removes only one framing newline, and projects model-visible results no larger than 50,000 bytes. It never truncates Core output or writes a result file.

## Tool surfaces

The normal active surface is:

- `career_run`: context, consent, analyze, match, suggestion-review, replacement-review, variant-review, materialize, and detail through ephemeral handles

The following raw tools stay registered but are normally inactive:

- `career_core_discover`: `capabilities`, `operations`, `schema-list`, `schema-export`, `schema-bundle`
- `career_core_resume`: `evaluate`, `analyze`, `analysis-suggestions-review`, `analysis-replacements-review`, `normalize`, `enrich`, `variant-review`, `variant-materialize`
- `career_core_job`: `normalize`, `match`

`/career-tools raw` explicitly activates the raw tools; `/career-tools managed` removes them from active model context. Raw agents remain discovery-first and pass one exact versioned JSON object in `input_json`.

## Process and machine framing

- Direct `spawn(command, fixedArgv, { shell: false })` only.
- Package launchers are fixed argument prefixes invoked by the real Node executable.
- Document content appears only in stdin with `--input -`, never argv, and stdin opens only after `spawn`.
- Machine output uses `--format json-compact`.
- Successful Core output is exactly one JSON object with one framing newline and no stderr.
- Known diagnostics are one bounded `career.error.v1` on stderr with nonzero status.
- Single-document input is bounded at 262,144 bytes; match and variant composites at 1,048,576 bytes.
- Timeout/cancellation owns child termination and cleanup.
- Fatal UTF-8, multiple JSON documents, unexpected successful stderr, or capture overflow fail closed.
- No payload/result temp file, model/provider call, vacancy URL fetch, telemetry, post-launch retry, or repair exists at this boundary.

The sole network-capable behavior is bounded acquisition of exact `@revazi/career@0.1.0` after local routes fail. It derives npm from real Node, rejects conflicting `npm_execpath`, has fixed time/output bounds and process-tree cancellation, receives no private input, and finishes before document stdin opens.

Raw tools retain the 50,000-byte/2,000-line model-context ceiling and fail without partial output. Managed operations use Core's 32-MiB capture ceiling internally and expose compact/hydratable results.

## Ephemeral handles and privacy

Resume handles resolve current scanned originals on demand rather than retaining every resume body. Review handles retain the exact private review input required for deterministic materialization; result/review/variant handles retain complete Core JSON. The registry is count/byte bounded, process-memory-only, and cleared on session/branch replacement and shutdown. Evicted or stale handles fail closed.

Persisted Pi sessions require an explicit consent entry before private handles are returned. Transient `pi --no-session` runs do not write those entries. This is not secure erasure and is separate from provider consent. Tool calls and compact results may still become part of normal Pi/provider context after submission.
