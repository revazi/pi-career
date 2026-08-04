# pi-career

Private, standalone [Pi package](https://github.com/earendil-works/pi) for the independently installed deterministic `career` CLI.

This repository owns only the Pi adapter, Pi package metadata, Pi-facing Agent Skill, build/package tests, and Pi integration guidance. Career Core remains authoritative for CLI operations, algorithms, versioned JSON schemas, errors, evidence, warnings, uncertainty, ordering, and assisted/non-authoritative semantics.

## Surface and non-scope

The package loads exactly three native tools:

- `career_core_discover`
- `career_core_resume`
- `career_core_job`

The extension uses local argv/stdin process execution only. It has no Cargo fallback and no model, provider, network, URL-fetching, UI, persistence, telemetry, MCP, repair, retry, or Core algorithm/schema implementation. See [`docs/design.md`](docs/design.md) and [`SECURITY.md`](SECURITY.md).

## Prerequisites

- Node.js 22.19 or newer for development/build checks
- Pi 0.80.10-compatible package APIs
- a reviewed, compatible `career` executable installed on `PATH`, or selected by a bounded absolute `CAREER_CLI_PATH`

Check the CLI before installation:

```bash
command -v career
career --version
career capabilities --format json-compact
career schema list --format json-compact
```

For an isolated installation, set an absolute executable override before starting Pi:

```bash
export CAREER_CLI_PATH="$HOME/.local/bin/career"
"$CAREER_CLI_PATH" --version
"$CAREER_CLI_PATH" capabilities --format json-compact
```

The extension never searches a Career Core source checkout and never invokes Cargo automatically.

## Build and verify

TypeScript under `src/` is authoritative. `dist/index.js` is intentionally tracked so a clean local or private-Git package can load without development dependencies. Pi-provided packages are external peer dependencies.

```bash
npm ci
npm run build
npm run check
npm run check:package
npm run audit:runtime
PI_OFFLINE=1 npm run test:pi-smoke
PI_OFFLINE=1 npm run test:install
git diff --check
```

`npm run check:dist` rebuilds into a temporary directory and requires byte-equivalence with the tracked bundle. On a clean checkout of a candidate revision, hosted CI additionally runs `npm run build` followed immediately by `git diff --exit-code -- dist/index.js`; this fails if the committed bundle was stale before package verification. `npm run check:package` runs dry-run and actual `npm pack` content checks in a temporary directory. The tarball is a local verification artifact only; do not publish it.

Optional installed-CLI compatibility uses caller-supplied, reviewed Career Core fixtures and never copies their authoritative goldens:

```bash
CAREER_CORE_FIXTURE_ROOT=/absolute/path/to/reviewed/career-core \
  npm run test:compat
```

Hosted CI does not require this private sibling checkout or provider credentials.

## Reviewed local installation

Pi local-path packages are referenced in place rather than copied. Build/verify this checkout, keep it at a stable path, then register the resolved absolute path:

```bash
cd /absolute/path/to/pi-career
npm ci
npm run build
npm run check:dist
package_root="$(pwd -P)"
pi install "$package_root"
pi list
```

Restart Pi or run `/reload` after a reviewed update.

To update a local-path installation, fetch/check out the reviewed revision in the same directory, rerun `npm ci`, `npm run build`, and the checks above, then restart Pi or use `/reload`. The local registration itself does not pin changing files.

Remove the registration with the same resolved path:

```bash
cd /absolute/path/to/pi-career
package_root="$(pwd -P)"
pi remove "$package_root"
pi list
```

## Private Git installation pinned to a commit

After reviewing a full commit SHA and configuring Git credentials for the private repository:

```bash
pi install git:github.com/revazi/pi-career@<full-reviewed-commit-sha>
pi list
```

A pinned Git package is not moved by `pi update --extensions`. To update, review a new full SHA and install that explicit ref:

```bash
pi install git:github.com/revazi/pi-career@<new-full-reviewed-commit-sha>
```

Remove it by repository identity:

```bash
pi remove git:github.com/revazi/pi-career
```

No npm/crate artifact is published by this project.

## Privacy before document operations

Pi may persist `input_json` tool arguments and complete tool results in session JSONL. Before placing private resume or job content in a tool call, make an explicit persistence decision. Prefer a new transient run when session saving is not wanted:

```bash
pi --no-session
```

This is not a secure-erasure guarantee and does not remove previous sessions, shell history, backups, provider copies, or saved output. Local Pi-context approval also does not authorize sending content to an external model/provider.

Start with `career_core_discover`, invoke only capabilities reported as available, and export the exact input schema before document calls. If the adapter reports `result_too_large` or `result_too_many_lines`, do not use partial or truncated output. Choose a separate local installed-CLI workflow that can consume the complete JSON.

## License and provenance

Licensed under either Apache-2.0 or MIT, at your option. See [`LICENSE-APACHE`](LICENSE-APACHE), [`LICENSE-MIT`](LICENSE-MIT), and [`NOTICE`](NOTICE).
