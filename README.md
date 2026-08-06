# pi-career

Self-contained [Pi package](https://github.com/earendil-works/pi) for deterministic Career Core workflows on explicitly supported native targets.

This publicly readable Git repository owns the Pi adapter, package-owned runtime artifacts and resolver, Pi package metadata, Pi-facing Agent Skill, build/package tests, and integration guidance. Career Core remains authoritative for operations, algorithms, versioned JSON schemas, errors, evidence, warnings, uncertainty, ordering, and assisted/non-authoritative semantics.

## Surface and non-scope

The package preserves exactly three native tools:

- `career_core_discover`
- `career_core_resume`
- `career_core_job`

On supported targets it also provides deterministic slash commands:

- `/career-setup`
- `/career-library`
- `/career-vacancy`
- `/career-match`
- `/career-analyze`

Commands call the same package-owned runtime directly through bounded argv/stdin execution; they never call an LLM-facing tool, provider, model, network, PATH, Cargo, sibling checkout, or downloaded runtime. The workflow scans only explicitly configured `.md`/`.txt` roots, excludes assisted variants and inputs over 50,000 Unicode scalar values from authoritative operations, and never overwrites source files. See [`docs/design.md`](docs/design.md), [`docs/product-flow.md`](docs/product-flow.md), and [`SECURITY.md`](SECURITY.md).

## Supported runtime targets

| Package target | Native platform |
|---|---|
| `darwin-arm64` | macOS on Apple silicon |
| `linux-x64-gnu` | Linux x64 with glibc |

Windows, macOS x64, Linux arm64, Linux musl, and unknown libc/platform combinations are unsupported. The package may register on an unsupported target, but deterministic operations fail closed with a payload-free `unsupported_platform` error; they never guess, download a runtime, search `PATH`, or invoke Cargo.

The unsigned package-owned runtime artifacts were produced and natively verified from Career Core commit `a3cdb4c6d7f966397e93ea4664071975bca7228c` by [artifact run 30953471793](https://github.com/revazi/career-core/actions/runs/30953471793). [`runtime/manifest.json`](runtime/manifest.json) pins target paths, sizes, SHA-256 values, provenance, and bounded contract digests. Before the first bundled spawn in each process, the selected regular executable is checked for exact size, mode, and SHA-256; only successful verification is cached in memory.

`CAREER_CLI_PATH` remains an optional developer/recovery override. When set, it must be a bounded absolute path to a separately reviewed compatible executable and takes precedence over the bundled runtime. Normal users do not set it.

## End-user prerequisites

- Pi with 0.84.0-compatible package APIs
- one of the two supported native targets above
- a reviewed clean local checkout, public Git commit, or exact npm version of this package

No separate Career Core checkout, `career` installation, Cargo, Rust toolchain, install-time build, or runtime download is required.

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

## Public npm installation pinned to a version

After reviewing the release metadata, install an exact published version:

```bash
pi install npm:pi-career@0.1.0
pi list
```

A versioned npm package is pinned and skipped by package updates. Review and install a new exact version to update. Remove it by package identity:

```bash
pi remove npm:pi-career
```

## Public Git installation pinned to a commit

After reviewing a full commit SHA, install directly from this public repository; no configured Git credentials are required:

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

The package is prepared for public npm publication as `pi-career` with no lifecycle scripts, package-owned runtime npm dependencies, or bundled Pi peer contents. The npm tarball carries the same two unsigned, hash-verified native executables as reviewed local and Git installations; it does not build them with Cargo on the user's machine.

This repository is still **Unreleased** and claims no current npm version, tag, or GitHub Release. [`docs/releasing.md`](docs/releasing.md) prepares a possible future, separately authorized `pi-career@0.1.0` npm publication, annotated `v0.1.0` Git tag, and GitHub Release. The reviewed full commit SHA and exact npm version are the installation coordinates, with no crate publication, custom release asset, signing, or notarization. Both the package-owned production audit and complete development/host-Pi audit must be clean.

## Contributor build and verification

Node.js 22.19 or newer is required for development checks; release verification uses npm 10.9.3 from the Node 22.19 CI toolchain. TypeScript under `src/` is authoritative. `dist/index.js` is its reproducible generated bundle and is intentionally tracked with the reviewed native runtimes so clean local, public-Git, and npm packages load without development dependencies. Node build/test tooling stays as directly executed `.mjs` under `scripts/` and `tests/` and is excluded from the package artifact. Pi-provided packages remain external peers.

```bash
npm ci
npm run build
git diff --exit-code -- dist/index.js
npm run check
npm run test:bundled-runtime
npm run audit:production
npm run audit:full
npm run check:publish
PI_OFFLINE=1 npm run test:pi-smoke
PI_OFFLINE=1 npm run test:install
git diff --check
```

`npm run build` rebuilds only `dist/index.js`; it never builds or downloads native runtimes. `npm run check:runtime-artifacts` enforces the runtime manifest, provenance, five-file source artifact contract, target magic, exact hashes/sizes/modes, and package bounds. `npm run audit:production` requires zero package-owned production vulnerabilities and `npm run audit:full` requires zero vulnerabilities across the complete development/host-Pi tree, both from an explicit low-severity threshold. Production/full audit and package commands invoke `process.execPath` with the absolute npm CLI derived from that real Node installation, verify any inherited `npm_execpath`, and remove omit/include/audit-level/`NODE_ENV` overrides; npm and tar are never selected from `PATH`. `npm run check:publish` is a direct Node authoritative readiness orchestrator but does not publish anything: it runs both strict audits and the package checks. Strict bounded parsing rejects duplicate decoded keys in audit and pack JSON. The package check uses verified absolute `/usr/bin/tar`, proves the tarball has no `node_modules` or Pi package contents, keeps exactly `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and `typebox` as wildcard external peers, extracts the artifact, loads it, executes the bundled runtime, and performs an isolated install/list/remove smoke. Any future audit finding blocks publication and requires remediation rather than a checked-in acceptance baseline.

Optional local compatibility uses an explicitly supplied reviewed Career Core fixture root while still executing the bundled runtime:

```bash
CAREER_CORE_FIXTURE_ROOT=/absolute/path/to/reviewed/career-core \
  npm run test:compat
```

Hosted CI needs no separate Core checkout or provider credentials. Its native matrix executes every claimed target: Ubuntu x64 GNU and macOS arm64.

## Privacy before document operations

Pi may persist native-tool arguments/results and workflow custom entries in session JSONL. The slash commands require the displayed session-persistence decision before the first private vacancy or compact result card is appended to a persisted session. Global config stores only canonical resume-root paths and bounded labels—never resume text, vacancy text, or Core output. Full Core JSON is not stored by the workflow, and custom workflow entries are excluded from LLM context.

For direct native-tool use, make the same explicit persistence decision before placing private resume or job content in `input_json`. Prefer a new transient run when session saving is not wanted:

```bash
pi --no-session
```

This is not a secure-erasure guarantee and does not remove previous sessions, shell history, backups, provider copies, or saved output. Local Pi-context approval also does not authorize sending content to an external model/provider.

Start with `career_core_discover`, invoke only capabilities reported as available, and export the exact input schema before document calls. If the adapter reports `result_too_large` or `result_too_many_lines`, do not request or use partial output. Full-result export is not yet available through pi-career.

## Maintainer and support

Maintained by [Revaz Zakalashvili](https://github.com/revazi). Use this repository's Issues for sanitized bugs and scoped feature requests, follow [`CONTRIBUTING.md`](CONTRIBUTING.md) for changes, and follow [`SECURITY.md`](SECURITY.md) for vulnerabilities. Never place private career content or vulnerability details in an ordinary issue.

## License and provenance

Licensed under either Apache-2.0 or MIT, at your option. See [`LICENSE-APACHE`](LICENSE-APACHE), [`LICENSE-MIT`](LICENSE-MIT), [`NOTICE`](NOTICE), and the package-bounded runtime license/notices files under [`runtime/`](runtime/).

The locked normal/build dependency evidence for both native CLI targets is in [`docs/native-dependency-inventory.md`](docs/native-dependency-inventory.md). The package preserves the exact selected MIT/copyright texts for every reachable crate group, Rust 1.97.1 Standard Library evidence, and the required [`Unicode License V3`](docs/licenses/Unicode-3.0.txt) text under [`docs/licenses/`](docs/licenses/). `npm run check:native-licenses` enforces that payload. The inventory is evidence, not legal advice or automated release approval; [`docs/releasing.md`](docs/releasing.md) requires documented human sign-off and transparently records sole-maintainer review when independent review is unavailable.
