# Security and privacy

## Reporting

Do not open an ordinary issue with vulnerability details. Public repository visibility does not change this rule: use a private Security-tab reporting/advisory route when it is available to your repository role; otherwise contact the maintainer through an already agreed private channel before sharing exploit details. Do not include resume text, job descriptions, credentials, executable paths, Pi sessions, hashes, environment values, or raw process diagnostics in a report.

## Bundled runtime boundary

On supported targets, the extension invokes only its reviewed package-owned Career Core executable unless the caller explicitly sets a bounded absolute `CAREER_CLI_PATH` override. Resolution never searches `PATH`, a Career Core checkout, or Cargo and never downloads/builds a runtime.

Supported bundled targets are exactly `darwin-arm64` and `linux-x64-gnu`; Linux support requires positive glibc detection. Other platforms, architectures, musl, and unknown libc fail closed with a payload-free `unsupported_platform` error.

The committed runtime manifest pins exact Core commit/run provenance, paths, target triples, sizes, modes, SHA-256 values, notices, and bounded contract digests. Before the first bundled spawn per process, the resolver rejects links/non-files, verifies exact mode/size/SHA-256, and caches only successful verification in memory. Runtime-selection/integrity errors never expose platform details, paths, hashes, environment values, or raw filesystem errors. The imported binaries are unsigned package-owned artifacts tracked with the repository and included in the npm package; this project makes no signing or notarization claim.

## Process and data boundary

The selected runtime is invoked through direct argv-only `spawn` with `shell: false`. Document JSON is bounded, parsed as one object before spawn, and sent only through stdin.

The process adapter creates no career payload/result temporary file and performs no model, provider, credential, network, URL-fetching, telemetry, MCP, or retry/repair behavior. It enforces timeout/cancellation cleanup, independent stdout/stderr ceilings, fatal UTF-8 decoding, exact-one-object success, no success diagnostics, and complete-result context bounds. Oversized authoritative results fail rather than truncate; partial output and full-result export are unavailable.

The deterministic slash-command layer calls that adapter helper directly. Its global config stores only canonical root paths and bounded labels in an agent-directory-relative `0700` directory with atomic `0600` writes. Scans are bounded, UTF-8 strict, and symlink-free. Source text and full Core results are never written to global config or logs.

Only a strictly shaped, bounded, allowlisted `career.error.v1` may cross a known nonzero runtime failure. Other failures expose a stable payload-free `career.pi_error.v1`. Runtime code must not log or expose source/result text, raw errors, stderr, executable paths, hashes, platform details, environment values, or credentials.

## Pi session boundary

Pi may store tool arguments/results and workflow custom entries in session JSONL. Before the workflow appends its first private vacancy or compact result card in a persisted session, it requires the explicit local-persistence decision. Custom workflow entries do not enter LLM context, and full Core JSON is not stored. Direct private native-tool use still requires an explicit decision. Prefer a new transient run when persistence is not wanted:

```bash
pi --no-session
```

This is not secure erasure and does not remove shell history, backups, earlier Pi sessions, provider copies, or separately saved results. Consent to local Pi context is not consent to send content to an external model/provider.

## Installation and supply chain

Pi packages execute with the user's permissions. Install only a reviewed clean local checkout, public Git source pinned to a reviewed full commit, or public npm package pinned to an exact reviewed version. Review the tracked TypeScript bundle, runtime manifest/provenance, binary hashes/modes, package allowlist, registry metadata, and native CI results. Normal installation has no npm lifecycle script, post-install runtime download, Cargo/Rust build, or package-owned runtime npm dependency.

`npm run audit:production` must report zero package-owned production vulnerabilities and `npm run audit:full` must report zero vulnerabilities across the complete development/host-Pi tree, both with explicit `--audit-level=low`. Audit and pack checks invoke `process.execPath` with the absolute npm CLI derived from the real Node installation, require any inherited `npm_execpath` to resolve to that CLI, remove omit/include/audit-level/`NODE_ENV` overrides, and strictly reject duplicate decoded JSON keys. Package listing/extraction invokes verified root-owned absolute `/usr/bin/tar`; neither npm nor tar is resolved from `PATH`. The strict package check proves the tarball contains no `node_modules` or Pi package contents and declares exactly four wildcard external peers: `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and `typebox`. Those packages are supplied by the host Pi installation, outside this tarball's production dependency tree.

The direct Node `check:publish` orchestrator requires both clean audits and the extracted package proof. Any future low-or-higher audit finding, duplicate-key ambiguity, untrusted tool coordinate, command failure, or malformed report fails closed. Do not add an audit-acceptance baseline; remediate the dependency or stop publication.

A local-path registration follows later filesystem changes. Uninstalling the package only unregisters it; it does not erase Git clones, Pi sessions, shell history, backups, or document copies.

Supported security fixes apply to the latest reviewed repository revision and published npm version. Version `0.1.0` follows the package, tag, audit, provenance, and release boundary recorded in [`docs/releasing.md`](docs/releasing.md).
