# Materialized variant save design and threat review

## Status and authorization boundary

This document defines a proposed package-owned local save workflow for one successfully materialized, non-PDF assisted resume variant. It is a design and threat-review record only. The current package still creates no variant directory or file, and this document does not authorize implementation, publication, release, full-result export, or application-workspace persistence. Runtime work requires a separate explicit approval after this design is reviewed and merged.

The design is intentionally narrower than the future application workspace in [`application-workspaces.md`](application-workspaces.md). It saves only one materialized Markdown or text resume plus integrity metadata under the selected original's configured library root. It does not create `application.json`, persist a vacancy, save review input or Core JSON, generate a cover letter, or establish an application workspace root.

## Goals

A future implementation must:

1. accept only a current in-memory `variant:` handle returned by successful deterministic Career Core materialization;
2. show the exact destination, exact artifact bytes, exact sidecar bytes, hashes, and any directory marker before any filesystem mutation;
3. require a separate explicit confirmation after the unchanged preview;
4. publish new files without overwriting any existing path;
5. use `0600` regular files inside an owner-controlled `0700` managed directory;
6. preserve the original byte-for-byte and never use the original path as a write target;
7. label the artifact assisted/non-authoritative and bind it to the original and artifact hashes;
8. rescan immediately and prove that the new artifact cannot enter authoritative analysis or matching; and
9. retain payload-free failures, no logging, no provider/model call, no telemetry, and no network behavior.

## Non-goals

The first save implementation must not add:

- a model-callable save tool or a `career_run save` command;
- arbitrary-path export, full Career Core result export, or raw provider-response persistence;
- PDF, DOCX, Pages, HTML, image, OCR, or layout-preserving output;
- mutation, replacement, rename, deletion, permission change, or reformatting of an original;
- automatic materialization, automatic save after materialization, automatic retry, or overwrite-on-confirmation;
- application workspace manifests, vacancy files, cover letters, notes, or application-root configuration;
- session entries containing artifact text, destination paths, save previews, or save receipts;
- lifecycle scripts, native code, external commands, shell execution, package acquisition, or other network behavior; or
- Windows save support until an independently reviewed private-ACL and crash-consistency design can meet the same guarantees without relying on ignored POSIX mode bits.

Saving does not make assisted text authoritative, factually certified, safe to submit, or eligible for Career Core analysis or matching.

## User entry point and mode behavior

The only entry point is a user-invoked slash command:

```text
/career-save <variant-handle>
```

The command is deliberately absent from the active and raw model tool surfaces. An agent may tell the user that the command exists after materialization, but cannot invoke it as a tool or supply a destination. The command accepts exactly one bounded `variant:` handle and no path, filename, content, overwrite, or confirmation argument.

The command requires Pi to be idle and the handle to belong to the current session-scoped managed registry. It supports:

- **TUI:** ordinary Pi `editor` and `confirm` dialogs;
- **RPC:** the same dialogs through Pi's `extension_ui_request`/`extension_ui_response` protocol;
- **print/JSON:** stable fail-closed `interactive_mode_required` behavior with no write.

`ctx.ui.custom()` is not required and must not be the sole approval path because it returns `undefined` in RPC mode. Application-file approval remains independent from Pi session persistence and provider disclosure. A transient `pi --no-session` workflow may save only after the same file approval; a persisted session does not imply file approval.

The command performs no Core or provider call. It appends no custom or model-visible session entry. TUI dialogs are not a secure-erasure mechanism, and an RPC client may independently retain extension UI payloads.

## Eligible in-memory source

A save plan may be prepared only when all of these conditions hold:

- the handle resolves to a current registry entry of kind `variant` and operation `resume.variant.materialize`;
- the complete cached value has exact schema `career.resume_variant.v1` and authority `assisted_non_authoritative`;
- the entry retains an implementation-owned binding to the original resume ID, original root ID, canonical original path fingerprint, original format, and original text SHA-256 inherited unchanged through review and materialization;
- the original format is Markdown or text, never PDF;
- `assisted_resume_text` is a string with no unpaired UTF-16 surrogate, and its exact UTF-8 encoding is non-empty and at most 262,144 bytes;
- at least one canonical reviewed change was explicitly selected; and
- a fresh pre-preview scan finds the same original as an eligible original with the same canonical identity, format, and text digest and finds neither the selected root nor total library scan capped.

The implementation must never reconstruct assisted text from conversation messages, tool-result projections, sidecars, a prior save, or model prose. Only the complete unchanged in-memory Core materialization value is eligible. Session switch, branch replacement, reload, shutdown, registry eviction, stale original content, or a PDF source invalidates saving.

## Destination derivation and managed directory

The command derives the destination; it never accepts one from the model or command arguments.

1. Start from the originating configured library root.
2. Use `generated_variants_root` only when it is a direct child of that exact canonical root.
3. Otherwise derive `<originating-library-root>/variants`.
4. Reject root paths, nested paths, paths outside that root, control characters, overlong paths, symlinks, aliases, and a destination equal to any configured library root.

The v1 save root is therefore a narrow managed variants directory inside the originating scan root. An existing `generated_variants_root` outside or deeper than that root remains suggestion-only and is not eligible for package-owned saving. The future separate application workspace is unaffected.

The directory marker path is exactly `<save-root>/.pi-career-variants.json` and uses this schema:

```json
{
  "schema_version": "pi.career.variants_directory.v1",
  "kind": "managed_variants_directory",
  "library_root_id": "<64 lowercase hexadecimal characters>",
  "created_at": "<canonical UTC timestamp with milliseconds>"
}
```

The encoded marker has the field order above, a single trailing LF, a 16,384-byte ceiling, mode `0600`, and no absolute path or private content. Parsing rejects duplicate decoded keys, unknown fields, invalid UTF-8, and noncanonical IDs or timestamps.

Before preview, the save root must be one of:

- absent, with its canonical configured library root as the existing parent; or
- an owner-controlled, non-symlink, canonical `0700` directory containing a valid matching marker; or
- an owner-controlled, non-symlink, canonical, empty `0700` directory that the preview explicitly proposes to initialize with the marker.

A non-empty unmarked directory is never adopted. Existing permissions are never changed silently. On POSIX, the directory owner must equal the current effective user and exact permission bits must be `0700`. The implementation does not rely on `umask`. Save fails closed on Windows because Node's POSIX mode arguments do not establish the required private ACL contract there.

## Artifact naming and content

The package generates a fixed plan name before preview:

```text
resume-assisted-<UTC-basic-timestamp>-<first-8-lowercase-UUID-hex>.<md|txt>
```

The timestamp is the plan's canonical `Date.toISOString()` value transformed without punctuation, for example `20260811T030405123Z`. The extension comes only from the original format. Labels, company names, role names, original basenames, provider names, and model output never enter the filename. The random suffix is collision resistance, not overwrite permission. Both final paths must be absent and remain no-clobber publication targets.

The artifact bytes are exactly `Buffer.from(assisted_resume_text, "utf8")`. The package adds no BOM, trailing newline, newline normalization, header, label, or formatting change. The package never edits a successfully published artifact. A later user edit causes the sidecar hash check to fail closed until a separately designed adoption/review flow exists.

The paired sidecar is `<artifact-stem>.pi-career.json` and uses this exact package-owned schema:

```json
{
  "schema_version": "pi.career.assisted_variant_meta.v2",
  "kind": "assisted_variant",
  "authority": "assisted_non_authoritative",
  "base_document_id": "<original resume ID>",
  "base_text_sha256": "<SHA-256 of the scanned original text>",
  "artifact_sha256": "<SHA-256 of the exact artifact bytes>",
  "created_at": "<canonical UTC timestamp with milliseconds>"
}
```

The encoded sidecar has the field order above, a single trailing LF, a 16,384-byte ceiling, and mode `0600`. Hashes provide local integrity binding only; they do not establish authorship, factuality, or provenance outside this workflow. No review handle, result handle, source path, vacancy, selected text, provider response, prompt, Core result, or credential is persisted.

Existing valid `pi.career.assisted_variant_meta.v1` sidecars remain supported and are not rewritten in place. Version 2 is used only for newly package-saved artifacts.

## Exact preview and confirmation protocol

Preparation is read-only. The command builds this exact preview envelope:

```json
{
  "schema_version": "pi.career.variant_save_preview.v1",
  "save_id": "<lowercase UUID>",
  "initialize_directory": true,
  "directory_path": "<exact absolute managed directory>",
  "marker": {
    "path": "<exact absolute marker path>",
    "utf8_bytes": 0,
    "sha256": "<SHA-256 of exact marker bytes>",
    "text": "<complete exact marker text>"
  },
  "artifact": {
    "path": "<exact absolute artifact path>",
    "format": "markdown",
    "utf8_bytes": 0,
    "sha256": "<SHA-256 of exact artifact bytes>",
    "text": "<complete exact materialized text>"
  },
  "sidecar": {
    "path": "<exact absolute sidecar path>",
    "utf8_bytes": 0,
    "sha256": "<SHA-256 of exact sidecar bytes>",
    "text": "<complete exact sidecar text>"
  }
}
```

`initialize_directory` is `false` and `marker` is `null` when a valid marker already exists. `artifact.format` is exactly `markdown` or `text`. The field order shown is canonical; encoding is `JSON.stringify(preview, null, 2)` plus one LF. The preview itself is bounded to 524,288 UTF-8 bytes. No filesystem object is created before the preview is accepted.

The command opens the preview with `ctx.ui.editor()`. The returned text must be byte-for-byte identical to the generated preview. Cancellation or any edit—including whitespace—ends the command with no write. The editor is used for portable complete inspection, not for editing materialized content.

Only after unchanged preview acceptance does the command call `ctx.ui.confirm()` with the fixed save ID, exact directory, artifact and sidecar filenames, byte counts, hashes, assisted/non-authoritative warning, overwrite prohibition, and marker creation when applicable. A false, cancelled, missing, malformed, mismatched, or timed-out response produces no write. Confirmation cannot be supplied in command arguments, tool payloads, session entries, or prior conversation.

After confirmation and before the first mutation, the implementation revalidates:

- current session and registry ownership;
- complete variant schema, authority, bytes, and hashes;
- unchanged original identity and digest through a fresh uncapped scan;
- unchanged config and destination derivation;
- directory identity, ownership, mode, marker, and containment; and
- absence of both final paths.

Any drift invalidates the fixed plan. The command does not silently rebuild, rename, or reconfirm a replacement plan.

## No-clobber publication protocol

Implementation must use Node filesystem APIs directly with no shell or external executable. It must participate in Pi's `withFileMutationQueue()` for both real final paths, acquire a package-local save-root mutex in deterministic path order, and keep the whole validate/write/publish/verify window inside those guards. These queues prevent in-process lost updates; they do not claim protection from a malicious process running as the same operating-system user.

On supported POSIX systems, publication uses same-directory temporary regular files and no-clobber hard-link publication:

1. If approved initialization is needed, create only the direct-child directory with non-recursive `mkdir(..., 0o700)`, then revalidate canonical identity, owner, and exact mode. Publish the approved marker through the same temporary-file protocol before artifact publication.
2. Create unpredictable hidden temporary files in that directory with `O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW` and mode `0600`.
3. Write the complete artifact and sidecar buffers, sync each file, close it, set mode `0600`, and verify regular-file type, owner, mode, size, and SHA-256.
4. Publish the sidecar first by hard-linking its temporary inode to the absent final sidecar path. `EEXIST` is a collision and never authorizes replacement.
5. Publish the artifact second by hard-linking its temporary inode to the absent final artifact path. This order ensures a package-published artifact is never intentionally visible without its assisted marker.
6. Remove temporary names and sync the containing directory.
7. Reopen and verify both final files as non-symlink regular files with the approved inode identity, owner, modes, sizes, hashes, and exact sidecar-to-artifact binding.

`rename()` must not be used where its platform behavior can replace an existing final path. No preflight `exists` check is treated as a write guarantee. Temporary names, marker names, and final names are fixed package-generated basenames and cannot contain separators.

Cancellation is honored through preview and final confirmation and once more immediately before publication. After publication starts, the bounded commit/verification sequence runs to settlement rather than aborting between files. No network or child process is involved.

On a known failure before final publication, temporary files are removed best-effort. If the sidecar was published but artifact publication failed, the implementation removes that sidecar only after proving it is the inode created by the current plan; otherwise it leaves the harmless orphan and reports a stable failure. A crash may leave an orphan sidecar or hidden temporary file, but scanner rules below prevent either from becoming an original resume.

If an error occurs after both links may have succeeded, the implementation first verifies the approved pair. An exact pair is treated as published and proceeds to rescan. An indeterminate state returns a stable `save_status_unknown` error and never retries, chooses a new name, or claims rollback. The user must inspect the already-previewed destination before another attempt.

## Scanner migration and fail-closed classification

The scanner must be changed before save publication is enabled. Classification becomes:

| Context | Sidecar state | Classification |
|---|---|---|
| Outside the exact managed variants directory | absent | original |
| Anywhere | valid v1 sidecar | assisted variant |
| Anywhere | valid v2 sidecar with matching artifact hash | assisted variant |
| Anywhere | present but invalid, unreadable, duplicated-key, symlinked, oversized, or hash-mismatched sidecar | quarantined; never original |
| Exact managed variants directory | missing sidecar | quarantined; never original |
| Exact managed variants directory | invalid or missing directory marker | quarantined; never original |

Quarantined candidates produce a bounded path-relative warning and are omitted from `eligibleOriginals()`, analysis, and matching. They must not fall back to `kind: original`. Sidecar parsing rejects unknown fields, duplicate decoded keys, invalid UTF-8, noncanonical hashes/timestamps, and content beyond 16,384 bytes. A valid v2 sidecar is checked against the exact bytes already read by the bounded scanner.

The managed-directory rule is exact and config/marker-bound; it is not a broad name exclusion for every directory called `variants`. Orphan sidecars and hidden temporary files are not supported resume candidates. Removing a valid sidecar or corrupting a package-saved file under the managed directory cannot promote it to an original.

After publication, the command immediately calls the normal bounded library scan and requires:

- the originating scan remains uncapped;
- exactly one record resolves to the approved canonical artifact path;
- its format and text equal the approved materialization;
- its kind is `assisted_variant`;
- its variant group/base document ID equals the original resume ID;
- no invalid-sidecar warning names it; and
- `eligibleOriginals()` excludes it.

Only then may the UI report success. If final files exist but rescan cannot prove these conditions, the command reports stable saved-but-unverified guidance without deleting or rewriting the approved pair. Subsequent analysis and matching remain protected by fail-closed scanner classification.

## Idempotency, retention, and removal

Within the current process, a verified save receipt is held only in memory and keyed by the variant handle. Repeating `/career-save` for that handle first verifies the exact existing pair and reports it without creating a duplicate. The receipt is cleared with the managed registry and is never appended to Pi session state.

After restart the variant handle no longer exists, so a save cannot be reconstructed from disk or conversation. Existing artifacts are discovered only as assisted variants by scanning.

Pi-career never automatically edits, overwrites, relocates, cleans, or deletes a saved artifact, sidecar, marker, orphan, or managed directory. Removing a library root from config, removing pi-career, deleting a Pi session, or enabling `PI_OFFLINE=1` does not remove saved files. User deletion is outside the package and does not provide secure erasure from backups, snapshots, sync services, RPC clients, or storage media.

## Stable failures and privacy

A future implementation may add bounded workflow error codes such as:

- `variant_save_unavailable`
- `variant_save_destination_invalid`
- `variant_save_preview_changed`
- `variant_save_collision`
- `variant_save_verification_failed`
- `variant_save_status_unknown`
- `variant_save_platform_unsupported`

Errors expose no resume/vacancy/result text, sidecar content, absolute path, environment, temporary name, inode, hash, raw filesystem error, or stack. The exact approved path and hashes are shown only in the user-facing preview/confirmation/success UI. Nothing is logged at the adapter boundary.

The package must not claim secure erasure, filesystem immutability, malicious same-user isolation, factual certification, or durability beyond successful file and directory sync on the supported local filesystem.

## Threat model

| Threat | Required mitigation |
|---|---|
| Agent or model initiates persistence | Save is a user-only slash command with no model tool or path/content argument. |
| Session persistence is mistaken for file consent | File preview and confirmation are separate in every session mode, including `pi --no-session`. |
| Preview is edited to bypass Core review | Returned preview must be byte-identical; edited content is never accepted as an artifact. |
| Original overwrite or alias | Destination is package-derived under a direct-child managed directory; the original is freshly revalidated and never opened for writing. |
| Traversal or filename injection | Command accepts only a bounded handle; all basenames are package-generated and separator-free. |
| Symlink or stale-root escape | Canonical root/directory checks, owner/mode checks, `O_NOFOLLOW`, same-directory temporary files, post-create revalidation, and strict containment. |
| Concurrent save or built-in file mutation | Root-local mutex plus `withFileMutationQueue()` around the complete mutation window. |
| Existing-file replacement | Final publication is no-clobber hard linking; `EEXIST` fails and `rename` replacement is forbidden. |
| Crash between sidecar and artifact | Sidecar publishes first; orphan sidecars are harmless; managed-root missing/invalid sidecars quarantine candidates. |
| Corrupt sidecar launders assisted text as original | Any present invalid sidecar and any missing sidecar in the managed directory fail closed, never to original. |
| Stale/foreign/evicted variant handle | Session registry ownership, operation/schema/authority checks, and inherited original binding are revalidated twice. |
| PDF styling loss | PDF-origin variant handles remain ineligible; only exact Markdown/text materializations can save. |
| Oversized memory/UI/file use | Fixed artifact, sidecar, marker, and preview byte ceilings; bounded normal scanner verification. |
| Private data leaks through errors or logs | Stable payload-free errors and no source/result/path/hash/raw-error logging. |
| Unexpected provider, Core, or network activity | Saving uses only current in-memory materialization and local Node filesystem APIs. |
| POSIX permissions claimed on Windows | V1 saving fails closed on Windows pending a reviewed ACL design. |
| User edits a saved assisted file | V2 artifact hash mismatch quarantines it; pi-career never silently updates its sidecar. |
| Cleanup is mistaken for erasure | No automatic deletion or secure-erasure claim; retention surfaces are documented. |

## Acceptance-test plan for a separately approved implementation

Tests use synthetic Markdown/text only and must cover:

1. exact variant schema, assisted authority, selected-change, session, source binding, and byte eligibility;
2. PDF, stale original, changed original, foreign session, evicted handle, malformed Unicode, empty text, and oversized text rejection;
3. exact canonical preview-envelope bytes and TUI/RPC unchanged-preview plus separate-confirm success paths;
4. cancellation, changed preview, false confirmation, missing UI, print mode, and JSON mode with zero filesystem mutation;
5. exact package-derived direct-child root behavior and rejection of outside, nested, root-equal, stale, symlinked, wrong-owner, wrong-mode, non-empty unmarked, and Windows destinations;
6. first-use directory/marker preview and initialization with exact `0700`/`0600` modes;
7. exact artifact bytes with no BOM/newline/format mutation and exact canonical v2 sidecar bytes;
8. no-clobber behavior for artifact, sidecar, marker, temporary, symlink, hard-link, and concurrent collision cases;
9. injected failures before and after every create, write, sync, link, unlink, verification, and rescan boundary;
10. crash-state fixtures for orphan sidecar, hidden temporary file, missing sidecar, malformed sidecar, duplicate keys, hash mismatch, and invalid marker, all excluded from originals;
11. valid legacy v1 and new v2 sidecars remaining assisted and never rewritten during scan;
12. immediate uncapped rescan proving exact text, variant grouping, warnings, and `eligibleOriginals()` exclusion;
13. repeated same-process save returning the verified existing receipt without another file;
14. no Core invocation, provider call, network call, child process, session entry, full-result file, raw error, or log;
15. removal/config changes leaving user files untouched with documented no-erasure semantics;
16. deterministic package checks proving no synthetic saved artifacts or new runtime dependencies enter the npm tarball; and
17. Linux and macOS local filesystem acceptance, with Windows explicitly failing closed until separately authorized.

Before implementation review, the normal repository verification ladder and changed-file security/architecture review remain mandatory.
