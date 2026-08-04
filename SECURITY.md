# Security and privacy

## Reporting

Do not open an ordinary issue with vulnerability details. Use a private Security-tab reporting/advisory route when it is available to your repository role; otherwise contact the maintainer through an already agreed private channel before sharing exploit details. Do not include resume text, job descriptions, credentials, executable paths, Pi sessions, hashes, environment values, or raw process diagnostics in a report.

## Bundled runtime boundary

On supported targets, the extension invokes only its reviewed package-owned Career Core executable unless the caller explicitly sets a bounded absolute `CAREER_CLI_PATH` override. Resolution never searches `PATH`, a Career Core checkout, or Cargo and never downloads/builds a runtime.

Supported bundled targets are exactly `darwin-arm64` and `linux-x64-gnu`; Linux support requires positive glibc detection. Other platforms, architectures, musl, and unknown libc fail closed with a payload-free `unsupported_platform` error.

The committed runtime manifest pins exact Core commit/run provenance, paths, target triples, sizes, modes, SHA-256 values, notices, and bounded contract digests. Before the first bundled spawn per process, the resolver rejects links/non-files, verifies exact mode/size/SHA-256, and caches only successful verification in memory. Runtime-selection/integrity errors never expose platform details, paths, hashes, environment values, or raw filesystem errors. The imported binaries are unsigned private artifacts; this project makes no signing, notarization, release, or public-distribution claim.

## Process and data boundary

The selected runtime is invoked through direct argv-only `spawn` with `shell: false`. Document JSON is bounded, parsed as one object before spawn, and sent only through stdin.

The adapter creates no career payload/result temporary file and performs no model, provider, credential, network, URL-fetching, UI, telemetry, MCP, retry/repair, command, or extension-state behavior. It enforces timeout/cancellation cleanup, independent stdout/stderr ceilings, fatal UTF-8 decoding, exact-one-object success, no success diagnostics, and complete-result context bounds. Oversized authoritative results fail rather than truncate; partial output and full-result export are unavailable.

Only a strictly shaped, bounded, allowlisted `career.error.v1` may cross a known nonzero runtime failure. Other failures expose a stable payload-free `career.pi_error.v1`. Runtime code must not log or expose source/result text, raw errors, stderr, executable paths, hashes, platform details, environment values, or credentials.

## Pi session boundary

Pi may store tool arguments and tool results in session JSONL even though this extension does not persist documents. Before private document use, require an explicit user decision. Prefer a new transient run when persistence is not wanted:

```bash
pi --no-session
```

This is not secure erasure and does not remove shell history, backups, earlier Pi sessions, provider copies, or separately saved results. Consent to local Pi context is not consent to send content to an external model/provider.

## Installation and supply chain

Pi packages execute with the user's permissions. Install only a reviewed clean local checkout or private Git source pinned to a reviewed full commit. Review the tracked TypeScript bundle, runtime manifest/provenance, binary hashes/modes, package allowlist, and native CI results. Normal installation has no npm lifecycle script, download, Cargo/Rust build, or runtime npm dependency.

A local-path registration follows later filesystem changes. Uninstalling the package only unregisters it; it does not erase Git clones, Pi sessions, shell history, backups, or document copies.

Supported security fixes apply to the latest reviewed private revision until a release policy is established.
