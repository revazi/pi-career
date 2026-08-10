# External-runtime adapter design and threat model

## Scope and authority

`pi-career` is a public Pi adapter package for reviewed Career Core targets. It owns the Pi extension, external runtime resolver, Pi-facing Agent Skill, generated TypeScript bundles, package tests, and integration guidance. It does **not** own or package native Career Core binaries. Career Core remains authoritative for operations, schemas, algorithms, errors, evidence, warnings, uncertainty, ordering, and assisted/non-authoritative semantics; this repository does not copy those contracts or algorithms into TypeScript.

The primary managed Pi surface is `career_run`. It uses ephemeral resume/result/review/variant handles, internal Career Core operation/schema discovery, compact projections, and bounded detail hydration. The exact raw compatibility tools remain registered but are normally inactive:

- `career_core_discover`
- `career_core_resume`
- `career_core_job`

`/career-tools managed|raw|status` controls whether the raw tools occupy active model context; it never changes the process, compatibility, privacy, or runtime-resolution boundary.

The TypeScript source is authoritative. Checked-in deterministic `dist/index.js` and `dist/pdf-worker.js` bundles support clean local, pinned-Git, and npm Pi loading without packaged runtime dependencies. The isolated PDF worker bundles the reviewed text extractor; Pi-provided imports remain external peers. Package metadata permits only separately reviewed public publication of the unscoped `pi-career` package to the canonical npm registry.

The workflow layer registers `/career-setup`, `/career-library`, `/career-application`, `/career-vacancy`, `/career-match`, `/career-analyze`, and `/career-workbench`. Setup/library scanning remains local. Core-backed commands use the same resolver and process helper as the tools. `/career-workbench` performs no provider/model call: it builds a bounded, visibly reviewable ordinary Pi editor prompt, and nothing leaves the package until the user separately submits that message through Pi. See [`product-flow.md`](product-flow.md) and [`application-workspaces.md`](application-workspaces.md).

## Runtime resolution and compatibility

Runtime routes are resolved in this fixed order:

1. a bounded absolute `CAREER_CLI_PATH`, when explicitly set;
2. the first executable `career` on the caller's `PATH`;
3. a package-local exact `@revazi/career@0.1.1` launcher;
4. bounded acquisition of exact `@revazi/career@0.1.1` from the canonical npm registry, followed by direct execution of the resolved launcher;
5. otherwise a stable payload-free installation error.

There is no sibling-checkout, Cargo, source-build, lifecycle-script, arbitrary URL/download, unpinned package, or PATH-selected npm/npx fallback. `PI_OFFLINE=1` disables route 4. The resolver caches only a successful route in process memory and invalidates it whenever the `CAREER_CLI_PATH` or `PATH` value changes.

`CAREER_CLI_PATH`, PATH, and package-local installations are caller-controlled. Before any private operation opens stdin, the selected route must pass the exact managed compatibility surface: Core version `0.1.1`, all 15 `career.operation_catalog.v1` descriptors (capability mapping, CLI path, transport, schema IDs, input bounds, and 32-MiB output bound), and the required self-contained schema bundles with only valid local references. Explicit override failure never falls back. Automatically considered routes may be skipped during this payload-free compatibility phase. If a previously selected automatic executable later fails before its operation process emits `spawn`, the adapter may advance once to the next route; cancellation, timeout, or any already-started operation is never retried through another route.

The package-local and acquired routes execute the reviewed `@revazi/career` launcher using the real Node executable. Pi-career validates the exact v2 launcher manifest, ordered eight-package catalog reference, lockstep optional-package map, and bounded launcher file before execution. The launcher remains responsible for native package selection, libc requirements, package/version/provenance mapping, regular-file type, Unix mode or Windows file invariant, size, format, architecture, and SHA-256 verification before it starts Career Core. Pi-career does not duplicate those native verification algorithms or package native files.

Acquisition invokes the npm CLI derived from the real `process.execPath` installation using the reviewed Unix or Windows Node installation layout, rejects ambiguous or conflicting `npm_execpath`, pins the canonical registry/package/version, includes optional native packages, and disables lifecycle scripts. It never invokes an npm/npx executable selected from caller `PATH`. Unix acquisition pins `/bin/sh`; Windows acquisition validates `SystemRoot`, derives `System32/cmd.exe`, rejects conflicting `ComSpec`, sanitizes shell/PATH overrides, and uses that shell only inside npm's acquisition-only execution. npm's acquisition command prints only its controlled PATH through Node's `-p` option. From bounded stdout, pi-career requires exactly one absolute first PATH entry ending in `node_modules/.bin`, derives the fixed sibling `@revazi/career/bin/career.js`, and ignores platform-specific npm banner lines without exposing them. It then invokes the manifest-validated JavaScript launcher directly with real Node and `shell: false`; no npm command shim becomes the Career route.

Acquisition has fixed time/stdout/stderr bounds and sends no private stdin. The npm child starts in a detached process group: Unix cancellation signals the negative process-group ID, while Windows uses `CTRL_BREAK` for the detached npm group and a bounded forced pass for npm itself. Ordinary npm cache and `_npx` data may remain after acquisition; neither package removal nor `PI_OFFLINE=1` provides secure erasure.

The reviewed `@revazi/career@0.1.1` launcher supplies `darwin-arm64`, `darwin-x64`, `linux-x64-gnu`, `linux-arm64-gnu`, `linux-x64-musl`, `linux-arm64-musl`, `win32-x64-msvc`, and `win32-arm64-msvc`. GNU Linux requires glibc 2.35 or newer. Unknown targets/libc, older glibc, and native integrity failures remain delegated to that launcher and surface only as bounded adapter failures. Windows PATH discovery remains direct-argv-only and considers native `career.exe`/`.com`/extensionless files, not caller-selected `.cmd` or `.bat` shells; package launchers use the validated package-local/acquired route instead.

## Process and privacy boundary

The adapter calls `spawn(command, fixedArgv, { shell: false })`; operations and schema IDs are bounded before spawn. For package launcher routes, the fixed prefix is the validated launcher path invoked by the real Node executable. Document JSON is one bounded object string sent only through child stdin with `--input - --format json-compact`. Private stdin is not ended into the child until Node emits the successful `spawn` event.

The process adapter creates no payload/result temporary files and adds no model, provider, telemetry, repair, URL-fetching, or command retry after launch. The sole network-capable runtime behavior is the bounded exact-package acquisition above, which finishes before private stdin opens. A successful Core child must emit exactly one UTF-8 JSON object with no stderr. Raw tools retain the 50,000-byte/2,000-line Pi-context ceiling and fail without partial output. Managed execution captures the complete Core result up to Core's declared 33,554,432-byte successful-machine-output ceiling. Complete managed results and exact review inputs live only in a 16-entry/64-MiB process-memory registry addressed by ephemeral handles; session/branch replacement and shutdown clear private entries. Model-visible projections/details remain capped at 50,000 bytes and never truncate the authoritative Core result.

A direct Career Core operation timeout or abort sends `SIGTERM`, then `SIGKILL` after a bounded grace period, and settlement waits for close. npm acquisition uses detached process-group termination for descendants, including Windows `CTRL_BREAK` delivery rather than a PATH-selected tree-kill helper. stdout and stderr have independent byte ceilings. Fatal UTF-8, malformed/multiple success documents, successful stderr, signals, and stream failures map to stable errors. Only a strictly shaped, bounded, allowlisted `career.error.v1` may be nested in an adapter error. Source/result text, executable paths, hashes, platform/environment values, npm output, raw stderr, and filesystem/process errors are never logged or exposed.

The workflow may read configured `.pdf`/`.md`/`.txt` roots, atomically persist non-content global config—including one bounded preferred variation-directory suggestion—and append consented custom session entries. Searchable PDF text is extracted from bounded in-memory bytes in a package-owned worker with fixed page, time, result, and memory ceilings; network fetch is disabled before the parser loads. No full Core result is appended to session state or written to a file, and pi-career has no full-result file export.

## Threat model

| Threat | Mitigation |
|---|---|
| Shell or argument injection | Fixed allowlisted operation mappings, bounded schema-ID syntax, direct argv-only spawn, `shell: false`, document bytes on stdin only. |
| Executable substitution | Fixed route order; bounded absolute override; exact managed compatibility before private stdin; pinned canonical npm package; package launcher native verification. |
| Malicious PATH/npm shadowing | PATH `career` remains caller-controlled and must pass compatibility. npm is derived from real Node, conflicting `npm_execpath` is rejected, and npm/npx is never selected from PATH. |
| Unsupported or corrupted native package | The reviewed launcher validates target/libc, package lockstep, provenance, Unix mode or Windows file invariant, size, format, architecture, and SHA-256 and fails before native execution. |
| Private input sent to multiple routes | Compatibility probes contain no private input. Only a failure before `spawn` may retry once; started, cancelled, and timed-out operations never retry. |
| Acquisition sees private content | Acquisition completes before document stdin opens and receives no document bytes. `PI_OFFLINE=1` disables it. |
| Hung acquisition descendants | Fixed acquisition timeout/output bounds, detached process groups, Unix group signals, and Windows `CTRL_BREAK` plus a bounded forced npm pass. |
| Oversized request, stream, diagnostic, memory, or context | Core-catalog input ceilings, independent stdout/stderr ceilings, fixed timeouts, raw context limits, 32-MiB managed capture, bounded registry, and 50,000-byte projections. |
| Private payload disclosure in failures | Payload-free adapter errors; no source/result/path/environment/raw-error logging; only validated Core error envelopes may be nested. |
| Persistence mistaken for erasure | Config contains no source/result content; managed results are process-memory-only; npm/Pi/session/cache data is explicitly not claimed to be securely erased. |
| Supply-chain or package drift | Exact external package coordinate, canonical registry, reviewed launcher delegation, four wildcard external Pi peers, no packaged runtime dependency/tree, deterministic dist, strict package allowlist, trusted npm/tar tooling, and clean low-threshold audits. |

## Build, package, CI, and installation boundary

`npm run build` rebuilds only `dist/index.js` and `dist/pdf-worker.js`; it never builds, imports, or downloads native artifacts. The pi-career tarball contains no `runtime/`, native binary, `node_modules`, or Pi peer contents and declares no production/optional runtime dependency. Runtime acquisition is an invocation-time resolver route, not an npm lifecycle action.

Package/audit orchestration invokes npm through `process.execPath` plus its derived absolute CLI and uses verified root-owned `/usr/bin/tar`, never PATH-selected npm/tar. Checks sanitize npm tree/severity overrides, reject duplicate decoded JSON keys, enforce exactly four wildcard external peers, verify extracted load/offline failure/install behavior, and require clean production/full audits at `--audit-level=low`. These Unix release gates remain separate from cross-platform runtime acceptance.

`test:career-package` separately exercises exact-package acquisition, managed Core 0.1.1 compatibility, and representative synthetic resume/job operations. The manually dispatched hosted External Career Compatibility workflow runs that acceptance natively for all eight launcher targets: both macOS architectures, GNU Linux x64/ARM64, musl Linux x64/ARM64 in the exact pinned Alpine/Node container on native hosts, and Windows MSVC x64/ARM64. The macOS arm64 and Linux x64 GNU contexts run the complete release ladder; additional target jobs run build/type/runtime-boundary, exact-package, offline-load, and diff checks appropriate to their native environment. Ordinary pull requests run one required adapter job without external Career package acquisition; maintainers reserve the costly matrix for resolver/contract/platform changes and frozen releases.

A user may register a reviewed clean absolute local path, public Git URL pinned to a full reviewed commit, or exact `npm:pi-career` version. Installing pi-career does not install Career Core through a lifecycle script. At first Core use, a compatible explicit/PATH/package-local route is preferred; otherwise the exact package may be acquired unless offline. Removal unregisters pi-career but does not erase Pi sessions, shell history, npm cache, Git clones, backups, or separately saved results.

## Provenance

The initial process adapter, tool mappings, synthetic fake executable, process tests, and skill guidance were adapted from Career Core commit `100774ed8bb3b39c019d64ce105af1e3f209144f`. Managed-contract support was aligned with Career Core Phase 8 commit `f6d17835de4817e28ce84e8e5734ff592687dfcc`. The exact Core 0.1.1/eight-target launcher update was reviewed from Career Core commit `0318b3b0993ee23093c8f023757fa7e4d8b3b8e0` and protected publication run `31346152236`. Native distribution and integrity authority belong to exact `@revazi/career@0.1.1`, not pi-career.
