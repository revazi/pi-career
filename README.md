# pi-career

[![npm version](https://img.shields.io/npm/v/pi-career.svg)](https://www.npmjs.com/package/pi-career)
[![npm downloads](https://img.shields.io/npm/dm/pi-career.svg)](https://www.npmjs.com/package/pi-career)
[![CI](https://github.com/revazi/pi-career/actions/workflows/ci.yml/badge.svg)](https://github.com/revazi/pi-career/actions/workflows/ci.yml)
[![license: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](#license-and-provenance)

Self-contained [Pi package](https://github.com/earendil-works/pi) for deterministic Career Core workflows. It bundles reviewed native runtimes, a Pi extension, deterministic slash commands, and the `career-core` Agent Skill—without a separate Career Core checkout, Cargo installation, runtime download, or provider/model call.

Career Core remains authoritative for operations, algorithms, schemas, evidence, warnings, uncertainty, ordering, and assisted/non-authoritative semantics. See [`docs/design.md`](docs/design.md) and [`docs/product-flow.md`](docs/product-flow.md).

## What it provides

Native tools:

- `career_core_discover`
- `career_core_resume`
- `career_core_job`

Deterministic slash commands:

- `/career-setup` — configure reviewed resume-library roots and privacy choices
- `/career-library` — inspect configured Markdown/text resume libraries
- `/career-vacancy` — set or clear bounded vacancy text
- `/career-match` — normalize a vacancy and conservatively rank eligible resumes
- `/career-analyze` — inspect deterministic readiness details for one resume

Slash commands invoke the package-owned runtime directly. They never route through an LLM-facing tool, provider, model, network request, `PATH`, Cargo, sibling checkout, or downloaded executable.

## Supported platforms

| Package target | Native platform |
|---|---|
| `darwin-arm64` | macOS on Apple silicon |
| `linux-x64-gnu` | Linux x64 with glibc |

Windows, macOS x64, Linux arm64, Linux musl, and unknown libc/platform combinations fail closed with a payload-free `unsupported_platform` error.

Requirements:

- Node.js 22.19 or newer
- Pi with 0.84.0-compatible package APIs
- one of the two supported native targets

## Install

Install the exact npm release:

```bash
pi install npm:pi-career@0.1.0
pi list
```

A versioned npm source is pinned. Review and explicitly install a new version when updating. Remove it with:

```bash
pi remove npm:pi-career
```

Alternatively, install the immutable `v0.1.0` Git commit:

```bash
pi install git:github.com/revazi/pi-career@967da62503bc8a97c070946f6506ea3471baeb34
```

A reviewed local checkout can also be registered in place:

```bash
cd /absolute/path/to/pi-career
pi install "$(pwd -P)"
```

Local-path registrations follow later filesystem changes. Restart Pi or run `/reload` after a reviewed update.

## Use

Start with the setup flow:

```text
/career-setup
/career-library
```

Then set a vacancy and run deterministic matching or analysis:

```text
/career-vacancy
/career-match
/career-analyze
```

For direct native-tool calls, discover capabilities and export the exact input schema first. Invoke only capabilities reported as available. Preserve every returned warning, evidence item, source span, confidence value, uncertainty status, baseline boundary, and assisted/non-authoritative label.

`CAREER_CLI_PATH` is an optional developer/recovery override for a separately reviewed compatible executable. Normal users do not set it.

## Privacy

Pi may persist native-tool arguments/results and workflow custom entries in session JSONL. Before using private resume or vacancy content, explicitly decide whether the current Pi session may persist it. Prefer a new transient run when persistence is not wanted:

```bash
pi --no-session
```

This is not secure erasure and does not remove previous sessions, shell history, backups, provider copies, or separately saved output. Approval for local Pi context is also not approval to send content to an external provider.

The workflow stores only canonical resume-root paths and bounded labels in global config—never resume text, vacancy text, or full Core output. It scans only explicitly configured `.md`/`.txt` roots, excludes assisted variants and oversized inputs from authoritative operations, and never overwrites source files.

Oversized Core results fail without partial output. Full-result export is not available through this package.

## Security and release provenance

The two unsigned, not-notarized runtimes were built from Career Core commit `a3cdb4c6d7f966397e93ea4664071975bca7228c` by [workflow run 30953471793](https://github.com/revazi/career-core/actions/runs/30953471793). [`runtime/manifest.json`](runtime/manifest.json) pins paths, targets, provenance, sizes, modes, SHA-256 hashes, source archive identities, and bounded contract digests. The selected executable is verified before its first spawn in each process.

Release `v0.1.0` coordinates:

- npm: [`pi-career@0.1.0`](https://www.npmjs.com/package/pi-career/v/0.1.0)
- Git commit: [`967da62503bc8a97c070946f6506ea3471baeb34`](https://github.com/revazi/pi-career/tree/967da62503bc8a97c070946f6506ea3471baeb34)
- npm integrity: `sha512-mmbDdWDyWz77f2uLzZECJT9E6w1ZRCJjYFrUnZd3ldoS6ehEa5DrCENIfavHR5xMOFi0of6AVQ35ZTxwpeDeAQ==`
- GitHub Release: [`v0.1.0`](https://github.com/revazi/pi-career/releases/tag/v0.1.0)

Both the package-owned production audit and complete development/host-Pi audit were clean at the explicit low threshold. Native-license evidence received documented sole-maintainer review, not independent legal review. See [`SECURITY.md`](SECURITY.md), [`docs/releasing.md`](docs/releasing.md), and [`docs/native-dependency-inventory.md`](docs/native-dependency-inventory.md).

There is no crate publication, custom GitHub Release asset, signing, or notarization.

## Development

TypeScript under `src/` is authoritative. `dist/index.js` is the reproducible tracked bundle Pi loads. Build and test tooling remains directly executed `.mjs` under `scripts/` and `tests/` and is excluded from the npm package.

Release verification uses Node.js 22.19.0 and npm 10.9.3:

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
npm ls --omit=dev --depth=0
git diff --check
```

Optional compatibility against an explicitly reviewed Career Core fixture checkout:

```bash
CAREER_CORE_FIXTURE_ROOT=/absolute/path/to/reviewed/career-core \
  npm run test:compat
```

`npm run build` rebuilds only `dist/index.js`; it never builds or downloads native runtimes. `npm run check:publish` is a readiness check and does not publish anything. It requires both clean audits and verifies the strict package contents, external peers, extracted load, bundled runtime, and isolated Pi installation.

## Maintainer and support

Maintained by [Revaz Zakalashvili](https://github.com/revazi). Use [Issues](https://github.com/revazi/pi-career/issues) for sanitized bugs and scoped feature requests, [`CONTRIBUTING.md`](CONTRIBUTING.md) for changes, and [`SECURITY.md`](SECURITY.md) for private vulnerability-reporting guidance. Never place private career content or vulnerability details in an ordinary issue.

## License and provenance

Licensed under either Apache-2.0 or MIT, at your option. See [`LICENSE-APACHE`](LICENSE-APACHE), [`LICENSE-MIT`](LICENSE-MIT), [`NOTICE`](NOTICE), and the package-bounded notices under [`runtime/`](runtime/).

The exact native dependency and selected-license evidence is recorded in [`docs/native-dependency-inventory.md`](docs/native-dependency-inventory.md), with required license and copyright payloads under [`docs/licenses/`](docs/licenses/).
