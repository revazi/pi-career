# Security and privacy

## Reporting

Use GitHub private vulnerability reporting. Do not include resume text, job descriptions, credentials, executable paths, Pi sessions, or raw process diagnostics in a report. If private reporting is unavailable, contact the maintainer before sharing exploit details.

## Runtime boundary

The extension invokes only an independently installed `career` executable through direct argv-only `spawn` with `shell: false`. Document JSON is bounded, parsed as one object before spawn, and sent only through stdin. `CAREER_CLI_PATH`, when set, must be a bounded absolute path. There is no Cargo fallback.

The adapter creates no career payload/result temporary file and performs no model, provider, credential, network, URL-fetching, UI, telemetry, MCP, retry/repair, or extension-state behavior. It enforces timeout/cancellation cleanup, independent stdout/stderr ceilings, fatal UTF-8 decoding, exact-one-object success, no success diagnostics, and complete-result context bounds. Oversized authoritative results fail rather than truncate.

Only a strictly shaped, bounded, allowlisted `career.error.v1` may cross a known nonzero CLI failure. Other failures expose a stable payload-free `career.pi_error.v1`. Runtime code must not log or expose source/result text, raw errors, stderr, executable paths, environment values, or credentials.

## Pi session boundary

Pi may store tool arguments and tool results in session JSONL even though this extension does not persist documents. Before private document use, require an explicit user decision. Prefer a new transient run when persistence is not wanted:

```bash
pi --no-session
```

This is not secure erasure and does not remove shell history, backups, earlier Pi sessions, provider copies, or separately saved results. Consent to local Pi context is not consent to send content to an external model/provider.

## Installation

Pi packages execute with the user's permissions. Review source and the checked-in/reproducible bundle before installing. Pin private Git installation to a reviewed full commit. Uninstalling the package only unregisters it; it does not erase session or document copies.

Supported security fixes apply to the latest reviewed private revision until a release policy is established.
