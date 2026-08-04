# pi-career

Private, self-contained [Pi package](https://github.com/earendil-works/pi) for deterministic Career Core workflows on explicitly supported native targets.

This repository owns the Pi adapter, package-owned runtime artifacts and resolver, Pi package metadata, Pi-facing Agent Skill, build/package tests, and integration guidance. Career Core remains authoritative for operations, algorithms, versioned JSON schemas, errors, evidence, warnings, uncertainty, ordering, and assisted/non-authoritative semantics.

## Surface and non-scope

The package loads exactly three native tools:

- `career_core_discover`
- `career_core_resume`
- `career_core_job`

The extension invokes a package-owned native runtime through direct argv/stdin process execution. It has no PATH or Cargo fallback and no model, provider, network, URL-fetching, UI, persistence, telemetry, MCP, repair, retry, or Core algorithm/schema implementation. See [`docs/design.md`](docs/design.md), [`docs/product-flow.md`](docs/product-flow.md), and [`SECURITY.md`](SECURITY.md).

## Supported runtime targets

| Package target | Native platform |
|---|---|
| `darwin-arm64` | macOS on Apple silicon |
| `linux-x64-gnu` | Linux x64 with glibc |

Windows, macOS x64, Linux arm64, Linux musl, and unknown libc/platform combinations are unsupported. The package may register on an unsupported target, but deterministic operations fail closed with a payload-free `unsupported_platform` error; they never guess, download a runtime, search `PATH`, or invoke Cargo.

The unsigned private runtime artifacts were produced and natively verified from Career Core commit `a3cdb4c6d7f966397e93ea4664071975bca7228c` by [artifact run 30953471793](https://github.com/revazi/career-core/actions/runs/30953471793). [`runtime/manifest.json`](runtime/manifest.json) pins target paths, sizes, SHA-256 values, provenance, and bounded contract digests. Before the first bundled spawn in each process, the selected regular executable is checked for exact size, mode, and SHA-256; only successful verification is cached in memory.

`CAREER_CLI_PATH` remains an optional developer/recovery override. When set, it must be a bounded absolute path to a separately reviewed compatible executable and takes precedence over the bundled runtime. Normal users do not set it.

## End-user prerequisites

- Pi with 0.80.10-compatible package APIs
- one of the two supported native targets above
- a reviewed clean local checkout or private Git commit of this package

No separate Career Core checkout, `career` installation, Cargo, Rust toolchain, runtime download, or npm publication is required.

## Reviewed local installation

Pi local-path packages are referenced in place rather than copied. Register a reviewed clean checkout at a stable absolute path:

```bash
cd /absolute/path/to/pi-career
package_root="$(pwd -P)"
pi install "$package_root"
pi list
```

Restart Pi or run `/reload` after a reviewed update. A local registration follows files at that path and does not pin future changes, so update the checkout only to reviewed revisions.

Remove the registration with the same resolved path:

```bash
cd /absolute/path/to/pi-career
package_root="$(pwd -P)"
pi remove "$package_root"
pi list
```

## Private Git installation pinned to a commit

After reviewing a full commit SHA and configuring Git credentials for this private repository:

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

## Contributor build and verification

Node.js 22.19 or newer is required for development checks. TypeScript under `src/` is authoritative. `dist/index.js` and the reviewed native runtimes are intentionally tracked so clean local/private-Git packages load without development dependencies. Pi-provided packages remain external peers.

```bash
npm ci
npm run build
git diff --exit-code -- dist/index.js
npm run check
npm run test:bundled-runtime
npm run check:package
npm run audit:runtime
PI_OFFLINE=1 npm run test:pi-smoke
PI_OFFLINE=1 npm run test:install
git diff --check
```

`npm run build` rebuilds only `dist/index.js`; it never builds or downloads native runtimes. `npm run check:runtime-artifacts` enforces the runtime manifest, provenance, five-file source artifact contract, target magic, exact hashes/sizes/modes, and package bounds. `npm run check:package` performs strict dry-run/actual package checks, extracts the artifact, verifies modes and absence of package-owned `node_modules`, then loads and executes the extracted current-platform bundled runtime with `CAREER_CLI_PATH` unset and no system `career` on `PATH`.

Optional local compatibility uses an explicitly supplied reviewed Career Core fixture root while still executing the bundled runtime:

```bash
CAREER_CORE_FIXTURE_ROOT=/absolute/path/to/reviewed/career-core \
  npm run test:compat
```

Hosted CI needs no private Core checkout or provider credentials. Its native matrix executes every claimed target: Ubuntu x64 GNU and macOS arm64.

## Privacy before document operations

Pi may persist `input_json` tool arguments and complete tool results in session JSONL. Before placing private resume or job content in a tool call, make an explicit persistence decision. Prefer a new transient run when session saving is not wanted:

```bash
pi --no-session
```

This is not a secure-erasure guarantee and does not remove previous sessions, shell history, backups, provider copies, or saved output. Local Pi-context approval also does not authorize sending content to an external model/provider.

Start with `career_core_discover`, invoke only capabilities reported as available, and export the exact input schema before document calls. If the adapter reports `result_too_large` or `result_too_many_lines`, do not request or use partial output. Full-result export is not yet available through pi-career.

## Maintainer and support

Maintained by [Revaz Zakalashvili](https://github.com/revazi). Use this private repository's Issues for sanitized bugs and scoped feature requests, follow [`CONTRIBUTING.md`](CONTRIBUTING.md) for changes, and follow [`SECURITY.md`](SECURITY.md) for vulnerabilities. Never place private career content or vulnerability details in an ordinary issue.

## License and provenance

Licensed under either Apache-2.0 or MIT, at your option. See [`LICENSE-APACHE`](LICENSE-APACHE), [`LICENSE-MIT`](LICENSE-MIT), [`NOTICE`](NOTICE), and the package-bounded runtime license/notices files under [`runtime/`](runtime/).
