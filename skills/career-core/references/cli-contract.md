# Bundled runtime contract reference

Use this reference only after reading the parent skill. Career Core remains authoritative; pi-career validates its managed operation catalog and self-contained schema bundles rather than copying Core algorithms or public schemas.

## Runtime selection

Normal operations use the reviewed package-owned runtime for exactly:

- `darwin-arm64`
- `linux-x64-gnu` with positive glibc detection

Selection order is a bounded absolute `CAREER_CLI_PATH` developer/recovery override first, then the verified bundled target. There is no PATH, sibling-checkout, Cargo, install-script, npx, or download fallback. Every unsupported target fails closed.

Before first bundled execution per process, pi-career verifies the regular file's exact mode, size, and SHA-256 against its committed runtime manifest. A mismatch fails as `bundled_runtime_invalid`. These errors remain payload-free.

The current binaries come from exact Career Core commit `f6d17835de4817e28ce84e8e5734ff592687dfcc` and reviewed short-retention artifact run `31274605956`. They are unsigned maintainer handoff inputs, not public Core releases.

## Managed discovery

`career_run` internally invokes and caches only non-sensitive metadata from:

- `career operations --format json-compact`
- `career schema bundle --id <required-input-schema> --format json-compact`

The adapter requires exact `career.operation_catalog.v1` capability mappings, CLI paths, transports, input/output schemas, byte ceilings, and all-local bundle references. Incompatibility fails closed. These bootstrap results are not exposed to the model during the normal managed flow.

Every successful machine JSON result is completely serialized by Core before stdout and is bounded to 33,554,432 bytes including its framing newline. Managed execution captures that complete result in bounded ephemeral memory, removes only the framing newline, and projects a model-visible result no larger than 50,000 bytes. It never truncates Core output or writes a result file.

## Tool surfaces

The normal active surface is:

- `career_run`: context, consent, analyze, match, suggestion-review, replacement-review, variant-review, materialize, and detail through ephemeral handles

The following raw tools stay registered but are normally inactive:

- `career_core_discover`: `capabilities`, `operations`, `schema-list`, `schema-export`, `schema-bundle`
- `career_core_resume`: `evaluate`, `analyze`, `analysis-suggestions-review`, `analysis-replacements-review`, `normalize`, `enrich`, `variant-review`, `variant-materialize`
- `career_core_job`: `normalize`, `match`

`/career-tools raw` explicitly activates the raw tools; `/career-tools managed` removes them from active model context. Raw agents remain discovery-first and pass one exact versioned JSON object in `input_json`.

## Process and machine framing

- Direct `spawn(executable, argv, { shell: false })` only.
- Document content appears only in stdin with `--input -`, never argv.
- Machine output uses `--format json-compact`.
- Successful runtime output is exactly one JSON object and one framing newline.
- Known diagnostics are one bounded `career.error.v1` on stderr with a nonzero status.
- Single-document input is bounded at 262,144 bytes; match and variant composite envelopes at 1,048,576 bytes.
- Timeout/cancellation owns child termination and cleanup.
- Fatal UTF-8, multiple JSON documents, unexpected successful stderr, or capture overflow fail closed.
- No payload/result temp file, model/provider call, network request, URL fetch, telemetry, or retry exists at this boundary.

Raw tools retain the prior 50,000-byte/2,000-line model-context ceiling and fail without partial output. Managed operations use the Core-declared 32 MiB capture ceiling internally and expose compact/hydratable results instead.

## Ephemeral handles and privacy

Resume handles resolve current scanned originals on demand rather than retaining every resume body. Review handles retain the exact private review input required for deterministic materialization; result/review/variant handles retain complete Core JSON. The registry is count/byte bounded, process-memory-only, and cleared on session/branch replacement and shutdown. Evicted or stale handles fail closed.

Persisted Pi sessions require an explicit consent entry before private handles are returned. Transient `pi --no-session` runs do not write those entries. This is not secure erasure and is separate from provider consent. Tool calls and compact results may still become part of normal Pi/provider context after submission.
