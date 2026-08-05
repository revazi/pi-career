# Bundled runtime contract reference

Use this reference only after reading the parent skill. Export exact schemas through `career_core_discover`; this file intentionally does not copy the authoritative schema catalog.

## Runtime selection

Normal operations use the reviewed package-owned runtime for exactly:

- `darwin-arm64`
- `linux-x64-gnu` with positive glibc detection

Selection order is a bounded absolute `CAREER_CLI_PATH` developer/recovery override first, then the verified bundled target. There is no PATH, sibling-checkout, Cargo, install-script, or download fallback. Windows, macOS x64, Linux arm64/musl, and unknown targets fail closed with `unsupported_platform`.

Before first bundled execution per process, pi-career verifies the regular file's exact mode, size, and SHA-256 against its committed runtime manifest. A mismatch fails as `bundled_runtime_invalid`. These errors are payload-free and must not be expanded with platform details, paths, hashes, environment values, or raw failures.

## Discovery and operations

Use only the three native tools:

- `career_core_discover`: `capabilities`, `schema-list`, `schema-export`
- `career_core_resume`: `evaluate`, `analyze`, `analysis-suggestions-review`, `analysis-replacements-review`, `normalize`, `enrich`, `variant-review`, `variant-materialize`
- `career_core_job`: `normalize`, `match`

Invoke only capabilities whose status is `available`. Pass one exact versioned JSON object in `input_json`; the adapter writes it only to runtime stdin. Do not concatenate document text into commands, place source content in argv, or infer schemas from prose.

## Machine framing

- The adapter uses `--format json-compact`; successful runtime output is one JSON document with one framing newline.
- Known diagnostics are one bounded `career.error.v1` on stderr with a nonzero status.
- The runtime makes no implicit network request and does not modify input.
- Single-document input is bounded at 262,144 UTF-8 bytes; composite job-match and variant envelopes are bounded at 1,048,576 bytes.

## Pi adapter framing

The native tools use direct `spawn(executable, argv, { shell: false })`, stdin-only document JSON, fixed operation mappings, timeout/cancellation cleanup, separate stdout/stderr capture bounds, fatal UTF-8 decoding, and exact-one-object success.

Successful JSON is returned complete, with only the single framing newline removed. The process adapter writes no payload/result files and has no model/provider/network behavior. The separate deterministic slash-command layer calls this process helper directly and owns only its bounded config, scan, UI, and custom-session-entry behavior.

Known adapter failures use `career.pi_error.v1`. Only `career_cli_error` may include a nested strictly validated allowlisted `career.error.v1`. Other errors do not expose raw diagnostics, input/output, executable paths, hashes, platform details, environment values, or Node/filesystem errors.

If a complete result exceeds 50,000 bytes or 2,000 lines, the tool fails as `result_too_large` or `result_too_many_lines`. Do not request or use partial output. Full-result export is not yet available through pi-career.

## Privacy

Pi may persist native tool arguments/results in session JSONL. Require an explicit decision before private use and recommend a new `pi --no-session` run when session persistence is not wanted. This is not secure erasure and is separate from consent for any external provider.
