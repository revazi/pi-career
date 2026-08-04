# Installed CLI contract reference

Use this reference only after reading the parent skill. Export exact schemas from the executable; this file intentionally does not copy the authoritative schema catalog.

## Discovery

```bash
career capabilities --format json-compact
career schema list --format json-compact
career schema export --id <exact-id-from-list> --format json-compact
```

Invoke only capabilities whose status is `available`. Discovery is local and offline.

## Direct document commands

```bash
career resume evaluate --input - --format json-compact
career resume analyze --input - --format json-compact
career resume analysis-suggestions-review --input - --format json-compact
career resume analysis-replacements-review --input - --format json-compact
career resume normalize --input - --format json-compact
career resume enrich --input - --format json-compact
career resume variant-review --input - --format json-compact
career resume variant-materialize --input - --format json-compact
career job normalize --input - --format json-compact
career job match --input - --format json-compact
```

Pass one exact versioned JSON object on stdin. Do not concatenate document text into shell commands, use `eval`, or put source content in argv. A direct CLI fallback is appropriate only in a user-approved local workflow that can consume complete JSON, especially when the Pi tool reports `result_too_large` or `result_too_many_lines`.

## Machine framing

- Success exits `0`, writes one result JSON document to stdout, and writes no diagnostics.
- `json-compact` has one framing newline after the document.
- Diagnostics go to stderr as one bounded `career.error.v1` on known failures.
- Current nonzero status meanings are: `2` CLI usage, `3` input read/CLI byte limit, `4` malformed or structurally invalid JSON, `5` Core input validation, and `6` output write/serialization.
- Commands make no implicit network request and do not modify input.
- Single-document input is bounded at 262,144 UTF-8 bytes; composite job-match and variant envelopes are bounded at 1,048,576 bytes.

## Pi adapter framing

The native tools use direct `spawn(executable, argv, { shell: false })`, stdin-only document JSON, fixed operation mappings, timeout/cancellation cleanup, separate stdout/stderr capture bounds, fatal UTF-8 decoding, and exact-one-object success. `CAREER_CLI_PATH` is accepted only as a bounded absolute path; otherwise `career` resolves from `PATH`. There is no Cargo fallback.

Successful JSON is returned complete, with only the single CLI framing newline removed. The adapter writes no payload/result files and has no model/provider/network/UI/persistence behavior.

Known adapter failures use `career.pi_error.v1`. Only `career_cli_error` may include a nested strictly validated allowlisted `career.error.v1`. Other errors do not expose raw diagnostics, input/output, executable paths, environment values, or Node errors.

## Privacy

Pi may persist native tool arguments/results in session JSONL. Require an explicit decision before private use and recommend a new `pi --no-session` run when session persistence is not wanted. This is not secure erasure and is separate from consent for any external provider.
