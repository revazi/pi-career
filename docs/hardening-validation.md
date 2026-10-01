# Product hardening validation

This is a test-evidence index, not a release authorization or claim of production-wire acceptance. Coverage uses synthetic documents, labels, sessions, and temporary workspaces only.

## Black-box evidence

- Terminal presentation and navigation: `tests/workflow/overlay.test.mjs` checks Unicode/theme output at widths 8–120, TUI output at 32/48/80, visible wide-screen navigation hints, keyboard movement, and Escape cancellation. `tests/workflow/document-preview.test.mjs` checks bounded paging and preview clearing.
- TUI/RPC parity and discoverability: the overlay suite exercises registered commands in both modes, confirmation gates, and no-Core browsing; `tests/workflow/application-concurrency-acceptance.test.mjs` and `tests/workflow/lifecycle-restore-acceptance.test.mjs` cover persisted authority and restart behavior.
- Collections and resource bounds: `tests/workflow/application-catalog.test.mjs` browses 128 valid synthetic applications and verifies deterministic order and byte-for-byte non-mutation. `tests/workflow/capacity-boundary-matrix.test.mjs` covers root and per-application entry/byte limits; `tests/workflow/scan.test.mjs` covers bounded resume-library collections.
- Privacy and failure behavior: `tests/workflow/no-automatic-provider-submission.test.mjs`, `tests/workflow/no-private-sentinel-persistence.test.mjs`, and `tests/workflow/payload-free-error-boundaries.test.mjs` instrument forbidden provider/Core/session effects, private sentinels, and stable public failures.
- Restart, transient-session, branch, lock, crash, and drift cases are exercised by the lifecycle, attachment, concurrency, and workspace acceptance suites under `tests/workflow/`.

## Limitations

These tests provide synthetic local evidence only; they do not establish real-user usability, behavior in every terminal emulator during an actual live resize, production network acceptance, or secure erasure. The 128-application check asserts bounded collection size and deterministic behavior, not a wall-clock SLA. Optional Career Core fixture parity is skipped unless `CAREER_CORE_FIXTURE_ROOT` is explicitly supplied. Production audit passed in this run; full audit and `check:publish` remain blocked by the known upstream Pi shrinkwrap vulnerabilities tracked by #149. No audit baseline or policy exception is used.
