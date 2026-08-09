# pi-career

[![npm version](https://img.shields.io/npm/v/pi-career.svg)](https://www.npmjs.com/package/pi-career)
[![npm downloads](https://img.shields.io/npm/dm/pi-career.svg)](https://www.npmjs.com/package/pi-career)
[![CI](https://github.com/revazi/pi-career/actions/workflows/ci.yml/badge.svg)](https://github.com/revazi/pi-career/actions/workflows/ci.yml)
[![license: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](#license-and-provenance)

[Pi package](https://github.com/earendil-works/pi) for deterministic Career Core workflows. It provides a Pi extension, deterministic slash commands, the `career-core` Agent Skill, and a bounded resolver for compatible external Career Core installations. It packages no native binary and never uses a Career Core checkout, Cargo build, arbitrary download, or provider/model call.

Career Core remains authoritative for operations, algorithms, schemas, evidence, warnings, uncertainty, ordering, and assisted/non-authoritative semantics. See [`docs/design.md`](docs/design.md) and [`docs/product-flow.md`](docs/product-flow.md).

## What it provides

Primary managed tool:

- `career_run` — compact context, consent, analyze, match, reviewed suggestion/replacement/variant, materialization, and detail workflows through ephemeral handles

Advanced raw compatibility tools, registered but normally inactive:

- `career_core_discover`
- `career_core_resume`
- `career_core_job`

Use `/career-tools raw` to enable raw schema-level tools and `/career-tools managed` to return to the compact surface.

Workflow commands:

- `/career-setup` — configure reviewed resume-library roots, privacy choices, and the preferred variation-directory suggestion
- `/career-library` — inspect configured searchable PDF/Markdown/text resume libraries
- `/career-application` — isolate one company/role attempt in branch-aware session state
- `/career-vacancy` — set or clear bounded vacancy text
- `/career-match` — normalize a vacancy and conservatively rank eligible resumes
- `/career-analyze` — inspect complete deterministic readiness details in a bounded, paged viewer
- `/career-workbench` — prepare a guided, reviewable private rebuild prompt for the normal Pi editor
- `/career-tools` — show or switch the managed/raw active model-tool surface

`career_run`, `/career-vacancy`, `/career-match`, and `/career-analyze` invoke a compatible resolved runtime directly. The resolver checks `CAREER_CLI_PATH`, `career` on PATH, package-local `@revazi/career`, then bounded acquisition of exact `@revazi/career@0.1.0`. It validates the complete managed operation/schema surface before private stdin opens, so normal model turns need no schema export or nested `input_json`. Setup/library scanning and `/career-application` remain local, and `/career-workbench` stops after filling the editor. The only package-initiated network-capable behavior is exact npm acquisition after local routes fail; `PI_OFFLINE=1` disables it.

## Supported platforms

The reviewed `@revazi/career@0.1.0` launcher currently provides native packages for:

| Package target | Native platform |
|---|---|
| `darwin-arm64` | macOS on Apple silicon |
| `linux-x64-gnu` | Linux x64 with supported glibc |

The external launcher owns fail-closed target/libc and native integrity verification. Explicit `CAREER_CLI_PATH` and PATH routes remain caller-controlled and must pass the exact managed compatibility checks before receiving private input.

Requirements:

- Node.js 22.19 or newer
- Pi with 0.84.0-compatible package APIs
- a compatible local Career Core route or access to acquire exact `@revazi/career@0.1.0`

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

At first Career Core use, resolution is:

1. bounded absolute `CAREER_CLI_PATH`;
2. `career` on PATH;
3. package-local exact `@revazi/career@0.1.0`;
4. acquisition of exact `@revazi/career@0.1.0` from the canonical npm registry.

Set `PI_OFFLINE=1` to prohibit acquisition. An invalid explicit override fails without fallback. npm acquisition completes before private document stdin opens and may leave ordinary npm cache/`_npx` data; it does not provide secure erasure.

## Use

Start with the setup flow, select a directory, and place a searchable PDF, Markdown, or text résumé in it:

```text
/career-setup
/career-library
```

`/career-library` immediately shows indexed files and actionable notices. Searchable, unencrypted PDFs are extracted locally in a bounded worker (10 MiB and 20 pages maximum); image-only/scanned PDFs require OCR or export to Markdown/text first.

Setup also displays a suggestion-only destination for assisted resume variations. Unless explicitly overridden through **Set resume variations directory**, the preferred destination is `variants/` under the configured root for the selected original (the setup summary uses the first configured root). This preference creates no directory or file and never authorizes a write.

Create a company/role context, then set its vacancy and run deterministic matching or analysis:

```text
/career-application
/career-vacancy
/career-match
/career-analyze
```

To continue with the selected Pi agent, prepare a reviewable workbench prompt:

```text
/career-workbench
```

`/career-application` gives each company/role attempt an immutable session-scoped ID, scopes vacancy/result entries to that ID, and names an otherwise unnamed Pi session. Use `/new` before creating another application so prior company prompts never remain in the new model conversation. It does not create workspace files yet. The planned opt-in filesystem layout keeps one flat folder per company/role attempt; see [`docs/application-workspaces.md`](docs/application-workspaces.md).

The workbench never sends automatically. It offers guided score explanation, Career Core-reviewed improvement planning, a question-led rewrite interview, direct reviewed exact replacements, and—when a current vacancy exists—reviewed tailoring. The interview first reviews the deterministic priorities, then asks one small batch of factual questions and stops; only a later answer can become a bounded replacement proposal for Core review. The workbench places the complete private source context in Pi's editor so the user can inspect it before submitting. After submission, the selected Pi agent reruns the complete deterministic analysis rather than relying only on the displayed score, and every external proposal must pass the corresponding Core review. A non-PDF tailored variant can be materialized only in a later turn after the user explicitly selects canonical change IDs.

Originals remain immutable and assisted results remain non-authoritative. Markdown/text prompts preserve their visible structure; PDF prompts use extracted text and stop at reviewed targeted changes for manual application because pi-career cannot inspect or reproduce PDF typography, columns, spacing, or graphics. The current workflow does not save variants to files. When `/career-workbench` prepares a prompt, it includes the privacy-reduced preferred variation destination as suggestion-only local guidance so the selected Pi agent can recommend it first after a separate user request; exact path/file approval is still required before any external file-writing action.

For normal model-assisted work, call `career_run` with `command: "context"`. In persisted sessions it returns no private handles until the user explicitly approves or declines session persistence. Subsequent calls use returned `resume:...`, `result:...`, `review:...`, and `variant:...` handles with native payload objects; the current vacancy is implicit for match/tailoring. Complete Core results and exact review inputs remain in a bounded process-memory registry and disappear on session/branch replacement or restart. Use `detail` sections/items only when more evidence or canonical content is needed.

For explicitly enabled raw calls, discovery-first behavior remains mandatory: capabilities → operations → schema list/export/bundle → exact `input_json`. Raw JSON remains authoritative; managed projections must preserve exact warnings, discard codes, limitations, uncertainty/authority labels, and the evidence/source spans used for presented findings.

`CAREER_CLI_PATH` is an optional bounded override for a separately reviewed compatible executable. An installed compatible `career` on PATH is the next local route. Normal users may rely on exact-package acquisition unless they set `PI_OFFLINE=1`.

## Privacy

Pi may persist native-tool arguments/results and workflow custom entries in session JSONL. Before using private resume or vacancy content, explicitly decide whether the current Pi session may persist it. Prefer a new transient run when persistence is not wanted:

```bash
pi --no-session
```

This is not secure erasure and does not remove previous sessions, shell history, backups, provider copies, or separately saved output. Approval for local Pi context is also not approval to send content to an external provider.

The workflow stores only canonical resume-root paths, bounded labels, and an optional bounded absolute variation-directory suggestion in global config—never resume text, vacancy text, or full Core output. It scans only explicitly configured `.pdf`/`.md`/`.txt` roots, extracts searchable PDF text locally without OCR or network access, excludes assisted variants and oversized inputs from authoritative operations, and never overwrites source files. `/career-workbench` visibly places private source text in the editor; submitting that ordinary Pi message may persist it in session JSONL and send it to the selected provider.

Slash-command Core results within process limits can be inspected in a transient pager. Managed execution captures complete Core JSON up to Core's declared 32 MiB ceiling, stores at most 16 entries/64 MiB in process memory, and returns model-visible projections/details capped at 50,000 bytes. Raw oversized tool results and oversized managed detail fail without partial output. No full-result file export is available.

## Security and release provenance

pi-career packages no native Career Core artifacts. The exact reviewed runtime package coordinate is [`@revazi/career@0.1.0`](https://www.npmjs.com/package/@revazi/career/v/0.1.0). Its launcher validates native target/libc, lockstep package metadata, provenance, mode, size, format, and SHA-256 before native execution. Caller-controlled explicit/PATH routes must independently pass pi-career's exact managed operation-catalog and schema-bundle compatibility checks before private stdin opens.

Release `v0.1.0` coordinates:

- npm: [`pi-career@0.1.0`](https://www.npmjs.com/package/pi-career/v/0.1.0)
- Git commit: [`967da62503bc8a97c070946f6506ea3471baeb34`](https://github.com/revazi/pi-career/tree/967da62503bc8a97c070946f6506ea3471baeb34)
- npm integrity: `sha512-mmbDdWDyWz77f2uLzZECJT9E6w1ZRCJjYFrUnZd3ldoS6ehEa5DrCENIfavHR5xMOFi0of6AVQ35ZTxwpeDeAQ==`
- GitHub Release: [`v0.1.0`](https://github.com/revazi/pi-career/releases/tag/v0.1.0)

Both the package-owned production audit and complete development/host-Pi audit were clean at the explicit low threshold. Historical bundled-runtime evidence for `v0.1.0` remains recorded in [`docs/releasing.md`](docs/releasing.md) and [`docs/native-dependency-inventory.md`](docs/native-dependency-inventory.md); the current adapter tarball contains no native binary. See [`SECURITY.md`](SECURITY.md).

There is no crate publication, custom GitHub Release asset, signing, or notarization.

## Development

TypeScript under `src/` is authoritative. `dist/index.js` and the isolated `dist/pdf-worker.js` are reproducible tracked bundles. Build and test tooling remains directly executed `.mjs` under `scripts/` and `tests/` and is excluded from the npm package.

Release verification uses Node.js 22.19.0 and npm 10.9.3:

```bash
npm ci
npm run build
git diff --exit-code -- dist/index.js dist/pdf-worker.js
npm run bench:tokens
npm run check
npm run test:runtime-resolution
npm run test:career-package
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

`npm run build` rebuilds only the generated `dist/index.js` and `dist/pdf-worker.js`; it never builds or downloads native runtimes. `npm run check:publish` is a readiness check and does not publish anything. It requires both clean audits and verifies strict native-free package contents, external peers, extracted offline behavior, and isolated Pi installation. `npm run test:career-package` is the separate network-capable exact-package integration test.

## Maintainer and support

Maintained by [Revaz Zakalashvili](https://github.com/revazi). Use [Issues](https://github.com/revazi/pi-career/issues) for sanitized bugs and scoped feature requests, [`CONTRIBUTING.md`](CONTRIBUTING.md) for changes, and [`SECURITY.md`](SECURITY.md) for private vulnerability-reporting guidance. Never place private career content or vulnerability details in an ordinary issue.

## License and provenance

Licensed under either Apache-2.0 or MIT, at your option. See [`LICENSE-APACHE`](LICENSE-APACHE), [`LICENSE-MIT`](LICENSE-MIT), and [`NOTICE`](NOTICE).

The external `@revazi/career` distribution carries its own native license/notices. Historical pi-career `v0.1.0` bundled-native evidence remains in [`docs/native-dependency-inventory.md`](docs/native-dependency-inventory.md) and [`docs/licenses/`](docs/licenses/).
