# Application workspace design and threat model

## Status and authorization boundary

**Implementation status:** Gate 1 is implemented in the current unreleased source for independent security/architecture review. It includes strict config-v2 migration/CAS, one existing private disjoint application root, marker attach/detach, immutable manifest and full state/vacancy/selected-original revisions, and read-only reconciliation through user-only `/career-workspace`. This status does not authorize merge, release, publication, tagging, or any later gate.

Career Core remains authoritative for every career-domain operation, schema, algorithm, warning, error, evidence rule, and assisted/non-authoritative result. This design defines only pi-career-owned configuration and local-file protocols. It does not copy a Core schema or algorithm.

The deliberately bounded **implemented Gate 1 slice** is:

1. migrate an explicitly changed config from `pi.career.config.v1` to the exact v2 shape below;
2. configure one existing private application root, create or validate its package marker, and enforce complete disjointness from every resume-library root;
3. initialize one package-created directory for the current active application;
4. persist immutable application-state revisions containing status, an optional selected-original digest binding, and an optional exact current session-vacancy snapshot;
5. add later immutable status, selected-original, vacancy, and vacancy-clear revisions;
6. provide read-only status and reconciliation; and
7. leave every original, current `/career-save` destination, model/provider boundary, session schema, Core result, and unknown file unchanged.

The first slice does **not** implement application-workspace resume saving or package deletion. Those protocols are fully specified here so their risks are auditable, but each requires its own later approval. PDF/DOCX artifacts, cover letters, `changes.md`, notes, interview files, full-result export, provider-response persistence, adoption of user files, and arbitrary application browsing are outside application-workspace v1.

## Goals

Application-workspace v1 must:

- isolate one company/role attempt under one immutable application UUID;
- retain the current one-session/one-application rule and reattach only by that UUID;
- keep application data physically disjoint from every configured original-resume root;
- make every local mutation user initiated, exactly previewed, separately confirmed, no-clobber, private-mode, bounded, and recoverable to an auditable state;
- preserve workflow-original vacancy bytes rather than a Core normalization result;
- bind a selected original and assisted resume to fresh deterministic IDs and text digests without copying original content into metadata;
- preserve useful flat names such as `vacancy.md` and `resume.md` when they are safe no-clobber targets;
- never overwrite or delete an unknown, user-owned, or hash-drifted file; and
- retain stable payload-free failures and no source/result/path/environment/raw-error logging.

## Non-goals

Application-workspace v1 does not add:

- a model-callable command, `career_run` workspace command, raw tool, MCP surface, provider client, model invocation, automatic prompt submission, or telemetry;
- arbitrary path, content, filename, overwrite, confirmation, application-ID, or deletion arguments;
- a Core call, runtime-resolution attempt, child process, package acquisition, network call, or private Core stdin during a workspace action;
- mutation, relocation, deletion, or reformatting of an original resume;
- copying a PDF original or materializing extracted PDF text as a styled resume;
- DOCX, Pages, HTML, image, OCR, layout-preserving, cover-letter, notes, interview, or full-result persistence;
- automatic synchronization from session to files, files to session, or files to a provider;
- broad scanner exclusions based on names such as `applications/`;
- adoption of an unmarked nonempty root, an unmarked application directory, an edited package file, or a user-created artifact;
- package-owned backups, sync, encryption, secure deletion, or durability beyond successful file and directory sync on a supported local filesystem; or
- Windows support. The package-wide unsupported-platform guard must still run before commands or tools are registered.

The current user-only [`variant-save-workflow.md`](variant-save-workflow.md) remains a narrower and separate workflow. Its preview or confirmation does not authorize an application workspace, and workspace approval does not authorize `/career-save`.

## Inherited runtime, privacy, and output boundaries

All boundaries in [`design.md`](design.md) and [`product-flow.md`](product-flow.md) remain unchanged:

- `career_run` stays the primary managed tool; the exact raw compatibility names stay `career_core_discover`, `career_core_resume`, and `career_core_job`.
- Application commands use local Node filesystem APIs only. They do not resolve or invoke Career Core, open private child stdin, acquire npm content, call a provider/model, or create a payload/result temporary file outside the destination transaction.
- Existing `/career-vacancy` may validate its input through Core before a workspace action. A later workspace action consumes only the already accepted session entry and never repeats validation.
- No complete Core result, exact review input, provider response, prompt, credential, or raw model output enters config, a marker, a manifest, a state revision, a sidecar, an error, or a log.
- The only artifact content eligible later is the exact current in-memory assisted materialization already eligible for `/career-save`; no conversation, projection, pager, session entry, sidecar, or prior file may reconstruct it.
- Workspace UI may show private paths and complete private file bytes because that is the local approval surface. An RPC client may retain those UI payloads. They are never appended to the Pi session by pi-career.
- npm cache, Pi sessions, editor history, RPC clients, provider systems, backups, snapshots, sync services, and workspace files are separate retention surfaces. Nothing here claims secure erasure.

## Exact user-only surface and mode behavior

### Existing commands

The following current behavior remains unchanged:

- `/career-application` owns session-scoped application identity and status. It creates no workspace file.
- `/career-vacancy` owns the current session vacancy. It does not imply workspace consent.
- `/career-save <variant-handle>` owns the separate resume-library variation save protocol. Its handle argument and consent do not select or authorize an application-workspace artifact.
- `/career-workbench` only prepares an editor message. The user's later ordinary Pi submission is the separate provider-submission decision.

### New workspace command

The only new entry point is:

```text
/career-workspace
```

It accepts exactly no arguments. Any whitespace-trimmed argument fails with `invalid_command_arguments` before reading config, session private data, or filesystem content. It is absent from `career_run`, all raw tools, active model context, and command suggestions emitted as model-callable actions. An agent may tell the user the command exists, but cannot invoke it as a tool.

In the first implementation slice its TUI/RPC menu is exactly:

1. `Status and reconcile` — read-only;
2. `Initialize current application` — shown only when an active application has no attached valid workspace;
3. `Record current status and vacancy` — shown only when an attached workspace differs from current session state;
4. `Select original resume` — records a fresh digest binding, not content;
5. `Configure application root` — enters the root-configuration flow described below;
6. `Detach application root from config` — config-only; no workspace file changes;
7. `Close`.

After their separate approval gates, the same menu may add:

- `Save current assisted resume` — artifact-file consent class; and
- `Delete current application workspace` — deletion consent class.

No action accepts a path, content, confirmation, overwrite flag, application UUID, or filename through slash-command arguments. Root paths are entered only in the local TUI/RPC input dialog. An eligible original or in-memory variant is chosen only from a local bounded selector. Originals use the scan's stable relative-path/ID order. Later-gated variants use current registry insertion order, newest first, with the bounded handle shown; even a single candidate requires selection. Confirmation is accepted only from the confirmation dialog tied to the current preview ID.

Mode behavior is exact:

| Pi mode | Behavior |
|---|---|
| TUI | Uses bounded `select`/`input`, then `editor` and `confirm` for a mutation. |
| RPC | Uses the same extension UI requests/responses. `ctx.ui.custom()` is neither required nor the sole approval mechanism. |
| print or JSON | Fails closed with `interactive_mode_required`; no read, write, directory creation, lock creation, session entry, Core/provider/network call, or output containing a private path. |
| unsupported platform | No workspace command is registered; `unsupported_platform` occurs before config/session/root access. |

`Status and reconcile` performs no editor/confirm because it cannot mutate. Every mutating action uses the exact preview protocol below.

## Five independent authorization classes

Consent is specific and non-transitive:

1. **Session persistence.** Current persisted-session consent governs custom `pi.career.workflow_state.v1` entries. In a transient `pi --no-session` run, entries remain transient. This consent does not authorize provider submission or a file.
2. **Provider submission.** `/career-workbench` prepares an ordinary editor message without calling a provider. Only the user's later normal Pi submission may send it. Session or workspace consent is not provider consent.
3. **Workspace-file mutation.** Root marker/configuration, application initialization, and every state/vacancy revision each require a complete unchanged workspace preview and then a separate confirmation.
4. **Artifact-file mutation.** Saving `resume.md`/`resume.txt`, its sidecar, and its state revision requires a new artifact preview and confirmation. A preceding workspace confirmation and any `/career-save` confirmation are irrelevant.
5. **Deletion.** Deletion requires a new complete deletion preview and a distinct destructive confirmation. Detach, status `closed`, session clear, package removal, or prior write consent never authorizes deletion.

A single confirmation may authorize all package-internal steps of one already previewed transaction in one class, such as its temporary files, final files, state commit, and required syncs. It cannot bundle two classes. In particular, initialization cannot also save a resume, and resume saving cannot also delete or replace an earlier artifact.

## Session and application identity

### Current session contract is retained

No session schema change is required in v1. For the current active UUID, the **identity entry** is the earliest strict `pi.career.workflow_state.v1` application entry on the active branch after the most recent application clear boundary; later application entries for that UUID are state entries. The implementation validates the branch rather than relying only on the latest reconstructed object:

- `application_id` is the immutable application UUID and must be identical in every state entry;
- the identity entry's `company_label`, `role_label`, and `created_at` are immutable identity metadata;
- every later entry for that UUID must retain those exact labels or the branch fails with `workspace_identity_conflict`;
- `status` is one of `preparing`, `applied`, `interviewing`, or `closed`; and
- a status update creates another strict application entry with the same UUID and labels but a later state timestamp.

Workspace references are not added to that strict schema. Session reconstruction remains authoritative for the active in-session application and vacancy; workspace reconstruction is separately authoritative only for local workspace files. `application_created_at` and the directory slugs always derive from the identity entry, while the latest valid entry supplies current status.

### One session, one application

An application workspace can be initialized only when the current branch reconstructs exactly one active application and its UUID is canonical lowercase. The current fresh-session rule remains:

- use `/new` before `/career-application` for another company/role;
- after a session has contained and cleared an application, it cannot create another application in that session;
- `/career-application clear` detaches the active session state but does not alter files; and
- a branch positioned before the application entry has no active application and cannot attach or mutate that workspace.

The package never accepts an application UUID from a command argument or file picker. It never uses company/role labels as authority.

### Restart, reattach, branch, and transient rules

- A persisted session reattaches after restart only when its validated active identity entry matches the UUID and `application_created_at` in valid `application.json` at the exact identity-label-slug-derived direct-child path. A bounded direct-child scan must also find no second manifest with that UUID. A missing expected match means unattached; any duplicate, timestamp mismatch, or same-UUID label drift is `workspace_identity_conflict`.
- The manifest UUID and identity-entry timestamp are identity authority, while the identity entry's immutable labels derive the expected location. A differently named or user-renamed directory is never adopted, and v1 never renames a directory.
- Session branches that contain the same application UUID address the same workspace. Divergent status/vacancy state is shown as drift and requires an explicit direction-specific write; it is never merged silently.
- A transient session may create workspace files after the same workspace consent. The UI must warn before preview that the files outlive the transient process. After shutdown, the transient session entries and managed handles cannot be reconstructed, so pi-career cannot reattach that directory from disk alone or invent a replacement session identity.
- Clearing an application, removing its session file, or removing the configured root does not delete or rewrite the directory.
- The application UUID never changes. Re-applying to the same company/role uses a fresh session and fresh UUID, producing a distinct directory.

## Configuration v2 and migration

### Exact shape

The existing agent-directory-relative config path remains unchanged as an intentionally stable single authority, even though its historical basename contains `v1`. The schema value, not the filename, is authoritative. This avoids two live config files and makes an older package fail closed on v2 rather than silently editing a stale v1 file.

A newly written v2 config is exactly:

```json
{
  "schema_version": "pi.career.config.v2",
  "library_roots": [
    {
      "id": "<64 lowercase hexadecimal characters>",
      "path": "<canonical absolute resume-library root>",
      "label": "Synthetic resume library"
    }
  ],
  "generated_variants_root": null,
  "application_workspace": {
    "root_id": "<lowercase UUID>",
    "root_path": "<canonical absolute application root>"
  }
}
```

Exact rules:

- Top-level fields and order are `schema_version`, `library_roots`, `generated_variants_root`, `application_workspace`.
- `generated_variants_root` is either `null` or the currently permitted bounded absolute suggestion.
- `application_workspace` is either `null` or exactly `{ "root_id", "root_path" }` in that order.
- When `application_workspace` is non-null, its root path must be component-disjoint in both directions from every library-root path and from a non-null `generated_variants_root`; equality is also invalid.
- Library-root object fields retain exact order `id`, `path`, `label` and current semantics. Root IDs remain the SHA-256 of their canonical paths; this package-owned identity rule is not a Core algorithm.
- `root_id` is a random lowercase UUID and must match the root marker. It is not derived from a private path.
- Unknown fields, missing fields, duplicate decoded keys, invalid UTF-8, a BOM, invalid IDs/labels/paths, noncanonical v2 encoding, trailing data, and content above 65,536 bytes fail closed.
- Canonical encoding is `JSON.stringify(value, null, 2)` in the field order above plus one LF. The file is a non-symlink regular file owned by the effective user, mode `0600`, with one link.

A v1 file is read using its existing exact fields and limits, but migration additionally rejects duplicate decoded keys and unsafe metadata. Migration is never automatic at startup or during ordinary `/career-setup`, `/career-library`, root-removal, or variation-suggestion writes. While `application_workspace` is logically null, absent/v1 config remains canonical v1 under those writers. Only the exact user-confirmed `/career-workspace` **Configure application root** mutation maps:

- the v1 `library_roots` unchanged and in order;
- an absent `generated_variants_root` to `null`, otherwise its unchanged validated value; and
- `application_workspace` to the newly approved root or `null`.

The agent's existing `career/` config directory must itself be canonical by realpath equality, have no symlink in its supplied component walk, be owned by the effective user, and have exact mode `0700`. The workspace flow neither creates nor chmods that directory. Ordinary first-run setup retains its separate safe bootstrap: when only `career/` is absent beneath an existing canonical owned agent directory, it may create that one direct child as private canonical `0700`, sync the agent directory, and then no-clobber-create canonical v1 config; it never recursively creates a missing agent directory or adopts/chmods a pre-existing unsafe object. A missing config file inside a valid private `career/` directory is treated as the logical empty v1 config only for a fixed workspace plan: `expected_config_sha256` is `null`, the preview shows a no-clobber v2 config creation, and any file appearing before publication invalidates the plan. A present config must satisfy its exact v1 or v2 parser. This makes first workspace config creation explicit without inventing a second config authority.

For a present config, the complete old bytes and complete new bytes appear in the mutation preview. Under the config mutation queue and config lock, the implementation rechecks the old inode, size, mode, owner, link count, and SHA-256 before an atomic same-directory replacement. Any drift cancels the fixed plan; it never merges or overwrites changed config. The replacement file is synced before rename, the config directory is synced after rename, and the exact new file is reopened and verified. For an absent config, a synced same-directory temporary file is published to the still-absent final path with the no-clobber protocol, never replacement rename. A crash exposes an absent file, the complete old config, or the complete new config, never a partial file.

After v2 exists, every package config reader and writer—including `/career-setup` library add/remove and variation-suggestion changes—must parse and preserve the exact `application_workspace` field and use the same config mutation queue, lock, and byte/inode compare-and-swap protocol. A library-root addition or variation-root change freshly revalidates the configured application root and rejects equality, either ancestor direction, or device/inode alias before writing; it cannot make a workspace scannable or reuse it as variant-destination guidance. If that validation cannot complete, the user must repair or explicitly detach the application root first. No v1-only writer may rewrite or downgrade v2.

### Application-root validation

The configured application root must:

- already exist; pi-career never creates it;
- be supplied as an absolute path of at most 4,096 UTF-8 bytes with no NUL, control character, `.`/`..` ambiguity, or trailing separator;
- be byte-identical to `realpath(path.resolve(input))`;
- have no symlink in the supplied component walk and itself be a non-symlink directory;
- be owned by the effective user, have exact POSIX mode `0700` including no special permission bits, and be readable/writable/searchable by that user;
- fit every direct-child final path within 4,096 UTF-8 bytes and every generated basename within 180 bytes; and
- be on a filesystem supporting the required exclusive create, hard-link publication, regular-file sync, and directory sync behavior.

Existing permissions are never changed silently. Wrong-owner/wrong-mode roots are rejected with guidance to choose or prepare a private root outside pi-career.

For application root `A` and every freshly canonicalized resume-library root `L`, v1 rejects all three cases:

- `A === L`;
- `A` is a path-component descendant of `L`; or
- `L` is a path-component descendant of `A`.

Device/inode equality is also rejected even if spellings differ. Stale library roots make application-root configuration unavailable until the library config is repaired. This is a physical two-way disjointness rule, not a scanner exclusion. The scanner receives no broad `applications` rule and continues to treat only configured resume roots as resume libraries.

### Root marker and adoption

The marker is exactly `<application-root>/.pi-career-applications.json`:

```json
{
  "schema_version": "pi.career.application_root.v1",
  "kind": "application_workspace_root",
  "root_id": "<lowercase UUID>",
  "created_at": "<canonical UTC timestamp with milliseconds>"
}
```

It has the field order shown, canonical two-space JSON plus one LF, fatal UTF-8 parsing, exact keys, a 16,384-byte ceiling, owner equal to the effective user, mode `0600`, and one link. It contains no absolute path, document text, provider data, Core output, or session identifier.

Before root configuration, exactly one case is allowed:

1. **Empty and unmarked.** The preview creates the marker and v2 config. The marker is published first; if a crash leaves only a valid marker, a later explicit configuration can attach it.
2. **Validly marked.** The marker UUID is reused only after a bounded direct-child audit. Direct children may be the marker and valid application directories; a current valid lock blocks rather than being adopted. Any other root-level entry rejects attachment.

A root has at most 1,024 persistent immediate entries including its marker. Audits read at most 1,025 names to detect overflow. Exceeding the cap reports `workspace_limit_reached`, blocks attachment and mutation, and never truncates the audit into apparent validity. The exact current-plan lock is the only temporary entry permitted above the cap while a locked operation settles.

An unmarked nonempty root is never adopted, even if it contains plausible manifests or only an incidental hidden file. An invalid, missing-from-an-attached-root, symlinked, wrong-owner, wrong-mode, multiply linked, oversized, or noncanonical marker is never repaired or replaced automatically. Removing root configuration leaves the marker and all children untouched. Reconfiguration of the same valid marked root is explicit workspace-file consent, not implicit discovery. Changing to a different root requires the separately confirmed detach action followed by a separately confirmed configure action, so configuration never races an in-flight mutation on the formerly attached root.

## Flat directory and naming contract

A valid v1 root is flat at the application level:

```text
<configured-application-root>/
  .pi-career-applications.json
  synthetic-company--platform-engineer--00000000-0000-4000-8000-000000000001/
    application.json
    .pi-career-state-000001.json
    vacancy.md
    .pi-career-state-000002.json
    vacancy-000002.md
    resume.md
    resume.pi-career.json
```

The values above are synthetic placeholders. The package creates no company directory, artifact-type subdirectory, backup directory, or nested application directory. The root marker and global config are the only package writes outside the one package-created application directory for that application. Transaction lock/temp objects are bounded temporary exceptions and are removed by the transaction that created them.

The application basename is:

```text
<company-slug>--<role-slug>--<full-lowercase-application-uuid>
```

The slug algorithm is package-owned and exact:

1. Unicode-normalize the current label with NFKD.
2. Remove combining marks.
3. Convert ASCII `A-Z` to `a-z`.
4. Replace each maximal run not in `a-z0-9` with one `-`.
5. Trim leading/trailing `-` and truncate to 32 ASCII bytes without a trailing `-`.
6. Use `company` or `role` when the result is empty.

The full UUID, not a prefix, prevents ordinary collisions. The generated basename is at most 104 ASCII bytes. It is display metadata, not identity. Once created it is never renamed when a label or status changes.

The expected path must be absent for initialization. If it exists with the exact valid manifest UUID and state chain, the operation is reattachment/idempotency, not creation. For inactive applications encountered during a root audit, only the safe two-slug/full-UUID basename grammar and equality between the UUID suffix and manifest UUID are validated; this does not make a differently named directory attachable to a current session. If a directory is unmarked, malformed, symlinked, wrong-owner, wrong-mode, hash-drifted, or bound to another UUID, initialization fails with no suffix retry and no adoption.

All application directories are direct children, non-symlink directories owned by the effective user with exact mode `0700`. Package-created persistent files are direct children, non-symlink regular files owned by that user with mode `0600` and one link. The package never follows an unknown symlink.

## Exact application metadata schemas

### Immutable application manifest

`application.json` is created once and never edited or replaced:

```json
{
  "schema_version": "pi.career.application_manifest.v1",
  "kind": "career_application",
  "application_id": "<lowercase UUID>",
  "root_id": "<root-marker UUID>",
  "application_created_at": "<identity entry's canonical UTC timestamp>",
  "workspace_created_at": "<canonical UTC timestamp with milliseconds>"
}
```

Fields have exactly the order shown. The manifest is canonical two-space JSON plus one LF and at most 16,384 bytes. It contains only package schema/kind, non-content identity bindings, and canonical timestamps.

The manifest contains no company/role label, slug, directory name, status, absolute or relative path, resume/vacancy/notes content, prompt, provider data, credential, exact review input, Core output, session ID, executable path, or environment value. Human-readable company/role slugs exist only in the private directory basename and are derived from the current session during initialization and reattachment; they are never duplicated into a manifest.

### Immutable state revisions

The current state is the highest complete contiguous revision named `.pi-career-state-<six-digit-sequence>.json`, beginning at `000001`. Every revision is a full snapshot:

```json
{
  "schema_version": "pi.career.application_state.v1",
  "kind": "application_state_revision",
  "application_id": "<lowercase UUID>",
  "sequence": 1,
  "parent_sha256": "<SHA-256 of application.json for sequence 1; prior revision thereafter>",
  "status": "preparing",
  "vacancy": {
    "relative_path": "vacancy.md",
    "content_sha256": "<SHA-256 of exact vacancy bytes>",
    "utf8_bytes": 123,
    "source_state_id": "<vacancy session-entry UUID>"
  },
  "selected_original": {
    "document_id": "<current scanned original ID>",
    "library_root_id": "<current configured library-root ID>",
    "text_sha256": "<SHA-256 of current normalized scanner text>",
    "format": "markdown"
  },
  "resume_artifact": null,
  "updated_at": "<canonical UTC timestamp with milliseconds>"
}
```

Exact unions are:

- `vacancy`: `null` or the four-field object shown;
- `selected_original`: `null` or the four-field object shown, with format `markdown`, `text`, or `pdf`;
- `resume_artifact`: `null` or exactly:

```json
{
  "relative_path": "resume.md",
  "artifact_sha256": "<SHA-256 of exact artifact bytes>",
  "sidecar_relative_path": "resume.pi-career.json",
  "sidecar_sha256": "<SHA-256 of exact sidecar bytes>"
}
```

Top-level and nested field order is fixed as shown. Relative paths are package-generated single basenames with no separator, `.` component, control character, or absolute form. A revision is canonical two-space JSON plus one LF, at most 16,384 bytes, mode `0600`, owner-only, one link, and exact-key/duplicate-key/fatal-UTF-8 validated.

The chain is valid only when:

- `application.json` is exact, its UUID/root match the active session and root marker, and its enclosing directory is the exact safe basename derived for that active session UUID/labels;
- revisions start at 1, are contiguous, and do not exceed 64 in v1;
- sequence 1 hashes the exact manifest as parent and every later revision hashes the exact prior revision;
- every referenced package file exists with exact type/owner/mode/link-count/size/hash and remains inside the direct-child directory; and
- there is no malformed or duplicate state-shaped basename.

A missing, forked, gapped, oversized, or hash-drifted chain is not partially trusted. No revision is overwritten, compacted, or deleted in v1.

## Eligible sources and artifact decisions

### Application and vacancy

Application metadata comes only from the validated strict identity/current application entries on the active branch. A workspace action snapshots the current session ID, identity entry, and active application UUID during planning and rechecks all three after confirmation and under locks.

Vacancy bytes come only from a current strict `VacancyEntry` whose `application_id` equals the active application UUID and whose stored SHA-256 still matches its text. The file bytes are exactly:

```text
Buffer.from(vacancy.vacancy_text, "utf8")
```

The current workflow converts editor CRLF/CR to LF before it creates the session entry. Therefore `vacancy.md` is byte-identical to the accepted **workflow-original session text**, not necessarily the pre-normalization editor buffer. The workspace performs no additional normalization, adds no BOM/header/trailing LF, and never writes Career Core's job-normalization output. An absent current vacancy is represented by `vacancy: null`; it does not delete an older vacancy file.

Vacancy text must be nonempty, contain no unpaired surrogate or carriage return, remain within the current 50,000-code-point Core input bound, and encode to at most 262,144 UTF-8 bytes. The `source_state_id` binds the snapshot to the exact current entry without persisting session content in metadata.

### Selected original

A selected-original binding may come only from a fresh uncapped `scanLibrary` result classified by `eligibleOriginals()`. The selected record must be unique by current record ID, root ID, format, and text digest; its root must be current and uncapped and the total scan must be uncapped. The state stores only document ID, library-root ID, normalized scanner-text digest, and format—never an absolute path or original bytes.

A later action re-runs the scan. Missing, assisted, quarantined, changed, capped, or ambiguous originals produce drift. An existing selected-original binding is never silently replaced. A user may explicitly select another original only before a resume artifact is attached; that change is a new workspace-file revision with its own preview/confirm.

### Assisted Markdown/text resume (later gate)

Application resume saving is eligible only when all current `/career-save` in-memory requirements still hold:

- a current session-owned `variant:` entry from successful `resume.variant.materialize`;
- exact `career.resume_variant.v1` and `assisted_non_authoritative` authority as validated by existing managed code, without reproducing the Core schema here;
- at least one explicit canonical selected change;
- an inherited source binding to one freshly rescanned eligible Markdown/text original with unchanged ID, root ID, format, and text digest;
- exact LF-only, nonempty UTF-8 assisted text with no unpaired surrogate and at most 262,144 bytes; and
- an active application and attached valid workspace in the same unchanged session.

PDF source bindings are ineligible. The package cannot preserve PDF layout. A selected-original binding must be absent or exactly match the variant source; the artifact transaction sets an absent binding and never changes a different one.

The first and only v1 application artifact is `resume.md` or `resume.txt`, selected solely from the original format. Its bytes are exactly the current assisted text, with no BOM, newline, header, or formatting change. The paired `resume.pi-career.json` uses the existing exact `pi.career.assisted_variant_meta.v2` schema and byte limits from [`variant-save-workflow.md`](variant-save-workflow.md). That sidecar remains the authority that the file is assisted/non-authoritative; the application state only binds the exact artifact and sidecar hashes. Neither file is eligible for authoritative reranking.

If either standard path exists, v1 does not choose a numbered alternative, replace it, or adopt it. Exact already-committed content is idempotent; any other content is a collision or drift.

### Explicit exclusions

The following are not eligible workspace sources in v1:

- a tool-result projection, model prose, conversation message, editor history, session result card, prior sidecar, prior saved file, or evicted/stale handle;
- complete Core JSON, review input, discarded proposal, PDF change plan, or normalization output;
- provider request/response bodies, prompts, credentials, or telemetry;
- PDF, DOCX, Pages, HTML, image, OCR, or other styled artifacts;
- `changes.md`, cover letters, notes, interview preparation, or user-owned editable-source copies; and
- arbitrary files selected by path.

Users may place their own files in an application directory, but pi-career treats every unrecognized entry as user-owned. It never reads it as Core input, references it in state, overwrites it, or deletes it.

## Mutation preview and confirmation

Preparation is read-only. Every mutation creates one canonical preview envelope:

```json
{
  "schema_version": "pi.career.workspace_mutation_preview.v1",
  "mutation_id": "<lowercase UUID>",
  "mutation_class": "workspace_file",
  "operation": "initialize_application",
  "application_id": "<lowercase UUID or null>",
  "expected_config_sha256": "<64 lowercase hexadecimal characters or null>",
  "expected_state_sha256": "<64 lowercase hexadecimal characters or null>",
  "creates": [],
  "replaces": [],
  "deletes": [],
  "temporary_paths": [],
  "warnings": []
}
```

`mutation_class` is exactly `workspace_file`, `artifact_file`, or `deletion`. `operation` is one of `configure_root`, `detach_root`, `initialize_application`, `record_state`, `select_original`, `save_resume`, or `delete_application`. All fields are always present and in the order shown.

A created object is exactly:

```json
{
  "path": "<exact absolute path>",
  "object_type": "file",
  "mode": "0600",
  "utf8_bytes": 123,
  "sha256": "<SHA-256 of exact bytes>",
  "text": "<complete exact UTF-8 file text>"
}
```

For a directory, `object_type` is `directory`, mode is `0700`, and `utf8_bytes`, `sha256`, and `text` are `null`. A replacement object has `path`, `object_type`, and `mode`, followed by exact `expected` and `replacement` byte objects containing `utf8_bytes`, `sha256`, and complete `text`. Only config may appear in `replaces`; no workspace or artifact file is replaceable. A deleted file has the same six fields as a created file and always contains complete current text. The final deleted directory uses the directory form with null byte/hash/text fields. Arrays use actual transaction order. `temporary_paths` lists every exact lock/temp path; temporary file content is already shown byte-identically as its corresponding create/replacement. `warnings` contains only fixed package strings.

The preview is canonical two-space JSON plus one LF, at most 5,242,880 UTF-8 bytes. An application directory is limited to 160 persistent immediate entries and 2,097,152 total package-managed file bytes. The complete maximum v1 package set is consistent with that entry cap: one manifest + 64 state revisions + at most 64 vacancy files + the later-gated resume/sidecar pair = 131 entries, leaving 29 entries for user-owned files while ordinary append-only use remains possible. Publication creates and removes at most one previewed same-directory temporary entry at a time; only that exact current-plan inode may transiently exceed the persistent cap.

Preparation reads at most 161 names to detect overflow and computes the proposed post-commit entry/managed-byte/revision totals. A non-idempotent plan fails with `workspace_limit_reached` before preview when it would exceed 160 persistent entries, 2,097,152 package-managed bytes, or revision 64. Locked revalidation repeats the calculation immediately before mutation. An already over-limit directory is reported read-only by reconciliation and blocks every mutation, including package deletion; pi-career never truncates, compacts, overwrites, or deletes older revisions to make room. An exact already-committed idempotent state remains reportable without mutation. A plan that cannot show every byte within the preview ceiling also fails with `workspace_limit_reached` before mutation.

The command calls `ctx.ui.editor()` with the complete preview. The response must be byte-for-byte identical. Cancellation or any edit, including whitespace, produces no mutation. Only then does it call `ctx.ui.confirm()` with a fixed title and a body containing mutation ID, class, operation, application UUID when present, object counts, exact final basenames, byte counts/hashes, no-overwrite warning, and class-specific retention warning. Confirmation times out after ten minutes. False, cancelled, missing, malformed, mismatched, or timed-out responses produce no mutation.

After confirmation and before the first mutation, the implementation revalidates the platform, mode, idle state, session ID, application UUID, consent-specific source, config bytes, root identity/disjointness, marker, directory, complete state chain, all referenced files, selected original/variant if applicable, exact plan bytes, and target absence. Drift invalidates the plan. It never silently rebuilds a preview, changes a filename, retries with a new UUID, or asks a prior confirmation to cover a new plan.

## Transaction, concurrency, and settlement protocol

### Lock order and assumptions

All implementation uses Node filesystem APIs directly with no shell or external executable. The global acquisition order is:

1. sorted `withFileMutationQueue()` keys for config and every real final path;
2. the package config lock when config is touched;
3. the application-root lock; and
4. no other lock.

Release is reverse order. Code must never acquire a lower-order guard while holding a higher-order guard. The config lock is `<agent-config-directory>/.pi-career-config.lock`; the root lock is `<application-root>/.pi-career-workspace.lock`. Each is an exclusive `0600` `O_CREAT | O_EXCL | O_NOFOLLOW` regular file with exact canonical fields in order `schema_version: pi.career.workspace_lock.v1`, `kind`, `mutation_id`, and `created_at`. `kind` is `config_mutation_lock` for the config lock and `workspace_mutation_lock` for the root lock. Both encodings are canonical two-space JSON plus one LF, at most 16,384 bytes, owner-only, one link, and contain no PID, path, or private content. Their exact paths appear in `temporary_paths`; their bytes are fixed by this protocol, while temp-file payload bytes are already displayed as the corresponding persistent create/replacement bytes. Acquisition never waits, sleeps, or polls; an existing lock returns `workspace_busy`. The owner unlinks only the exact inode it created and syncs the containing directory. A crash-left lock is reported by reconciliation and is never broken automatically.

Bootstrap of an empty unmarked root is the sole root-lock exception: under the config queue/lock it revalidates the root as empty, publishes the marker itself as the no-clobber cross-process claim, and writes config without creating a root lock in the previously unmarked root. A competing bootstrap loses marker publication or revalidation and cannot write config for a different marker UUID. All operations on an already marked root use the normal root lock. This exception permits a crash to leave a clean valid marker without an otherwise unrecoverable lock.

Queues serialize cooperating operations in one Pi process. Lock files and no-clobber publication detect cooperating cross-process races. V1 does not claim protection from a malicious or unsynchronized process running as the same operating-system user. Root privacy, symlink checks, inode checks, link-count checks, immutable final names, and post-verification reduce benign TOCTOU risk, but same-user hostile mutation remains outside the trust boundary.

### File publication

Persistent files are published with the reviewed no-clobber pattern used by `/career-save`:

1. Create an unpredictable previewed same-directory temporary file with `O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW`, mode `0600`.
2. Write the complete approved buffer, sync, set/verify mode, and close.
3. Reopen/verify regular-file type, owner, one temporary link, size, and exact SHA-256.
4. Hard-link the temporary inode to the absent final basename. `EEXIST` is a collision; `rename()` is never used for a workspace/artifact final file.
5. Unlink only the known temporary inode.
6. Sync the containing directory.
7. Reopen and verify the final inode, owner, mode, one link, size, bytes, canonical metadata parsing, and containment.

Directories use non-recursive `mkdir(..., 0o700)`, immediate canonical/owner/mode/inode revalidation, and parent-directory sync. The implementation never relies on `umask` and never `chmod`s a pre-existing object.

Config is the sole mutable file. A present config uses the cooperative config lock plus exact byte/inode compare-and-swap described above: a same-directory synced temp is atomically renamed only after the expected config is revalidated. An absent config uses no-clobber publication. No other package path uses replacement rename.

### Commit order

- **Configure an empty root:** publish and sync the root marker, then no-clobber-create or compare-and-swap the config as planned and sync its directory. A known pre-config failure may remove only the exact marker inode created by this plan if the root otherwise remains empty. A crash may leave a valid unattached marker, which is explicitly attachable later.
- **Initialize application:** create/sync the application directory; publish `application.json`; publish optional `vacancy.md`; publish `.pi-career-state-000001.json` last; sync the application directory and then root. The final state revision is the commit record.
- **Status/selection/vacancy update:** publish a new vacancy file first when needed, then publish the next state revision last and sync the application directory. Existing files are immutable.
- **Resume artifact (later gate):** publish the v2 sidecar first, artifact second, and state revision last. Thus an intentionally committed artifact is never unmarked, and an exact state commit references both.
- **Deletion (later gate):** use the deletion protocol below; deletion has no rollback claim.

Cancellation is honored through editor review, confirmation, guard acquisition, locked revalidation, and one final check immediately before the first temp/directory/final mutation. Once commit starts, the bounded sequence ignores cancellation and runs to settlement. It never launches another route or retries under another name.

### Immutable revision and idempotency decision

V1 deliberately chooses immutable state/vacancy revisions instead of compare-and-swap replacement. Human-readable `application.json`, initial `vacancy.md`, and first `resume.md` remain stable; lifecycle changes add bounded revision files. The state parent hash and no-clobber sequence basename provide a single-winner compare-and-append protocol:

- two writers planning the same next sequence target the same state filename;
- the first exact no-clobber link may commit;
- the loser receives collision/drift and must return to a fresh preview;
- no process merges divergent status or vacancy data automatically.

After an ambiguous error, the operation verifies the approved final state. An exact committed state is treated as success. An absent state with only known current-transaction inodes permits best-effort cleanup before returning failure. Any indeterminate identity returns `workspace_status_unknown`; it never reports rollback, retries, or chooses another name.

Repeating an action whose exact complete state is already the valid head is read-only idempotent success and creates no revision. In-process resume receipts may recognize an exact committed artifact. After restart, no artifact can be reconstructed from disk or conversation; disk content is only verified metadata, not a replacement for the managed variant handle.

## Crash states and reconciliation

`Status and reconcile` performs a bounded direct-child read only; it never deletes, repairs, adopts, appends, calls Core, or writes a session entry.

| Observed state | Classification and behavior |
|---|---|
| Valid marker, no config reference | Valid unattached root; only explicit root configuration may attach it. |
| Empty application directory | Interrupted initialization; invalid/unattached, never adopted. |
| Manifest without state 1 | Interrupted initialization; quarantined. |
| Vacancy file without referencing committed state | Orphan; never made current automatically. |
| Sidecar without resume | Harmless assisted orphan; never authoritative or attached. |
| Exact sidecar/resume pair without state | Uncommitted assisted orphan; not attached after restart. |
| Complete contiguous state chain | Highest exact revision is current. |
| Temp file from current live plan | Settled by that plan only. |
| Crash-left temp or lock | Reported and blocks mutation; never removed automatically. |
| Gap, malformed state-shaped name, bad parent hash, missing reference, or hash drift | Workspace drift; all package mutations fail closed. |
| State commit present after reported error | Exact approved state is idempotently recognized as committed. |
| Partial deletion | `workspace_deletion_status_unknown`; remaining objects are not retried or claimed erased. |

Known in-process failures remove temporary files and uncommitted final links only after proving current-plan inode identity. Cleanup is best effort and is never allowed to touch a changed inode. Crash-left objects require user inspection; a future repair/adoption workflow is outside v1 and needs separate design approval.

## Lifecycle, updates, and drift

Application status has two independent authorities: the current session entry for current conversation behavior and the latest workspace revision for local files. A mismatch is shown; neither silently wins.

`Record current status and vacancy` computes one new full snapshot from the active session:

- changed status becomes the new status;
- an unchanged current vacancy keeps the existing vacancy reference;
- a changed current vacancy is written to `vacancy-<state-sequence>.md` and referenced by the new state;
- no current vacancy writes `vacancy: null` but leaves every earlier vacancy revision untouched; and
- selected-original and resume-artifact bindings carry forward unchanged.

If initialization includes a vacancy, it uses `vacancy.md`. A later vacancy uses its target six-digit state sequence, for example `vacancy-000002.md`. These names are package-generated and never reused. Core-normalized content is not substituted.

A status of `closed` is metadata only. It does not detach, delete, archive, revoke provider copies, or change retention. Company/role labels and application UUID are immutable in v1. Correcting them requires a fresh session/application; no directory rename or manifest rewrite is available.

Before every mutation, all package-owned referenced files are hash verified. If a user edits `vacancy.md`, `resume.md`, a sidecar, manifest, marker, config, or state revision, pi-career treats the object as drifted/user-controlled. It never overwrites, rewrites a digest to bless the edit, deletes the object, or silently continues a chain from it. Unknown files that do not collide may remain and are ignored during ordinary append-only updates, but they block package deletion. A future explicit adoption flow is out of scope.

## Retention, detach, uninstall, and deletion

Workspace files persist until the user removes them. Specifically:

- `/career-application clear`, `/new`, branch changes, session deletion, transient shutdown, status `closed`, config detach, `PI_OFFLINE=1`, and package uninstall do not change a workspace file.
- Detaching the application root is a config-only workspace-file mutation with complete old/new config preview and confirmation. It leaves the root marker, lock/temp remnants, applications, and user files untouched.
- Reattaching a valid marked root is an explicit new workspace-file mutation. An active application reattaches only by exact UUID.
- pi-career creates no backup or sync copy. The filesystem, backup software, snapshots, indexing, RPC clients, Pi sessions, and providers may hold independent copies.
- Removing a package does not remove application roots, npm cache, Pi sessions, shell history, provider data, backups, or saved variants.

### Later-gated deletion protocol

`Delete current application workspace` is available only for the currently attached active application; there is no path or UUID argument and no root-wide delete. It is fail-closed unless:

- the manifest and complete state chain are valid;
- every referenced package file matches exact bytes/type/owner/mode/link count;
- every immediate entry is a recognized package-owned file referenced by that chain; and
- there is no unknown file, subdirectory, symlink, hard-link alias, temp, lock, malformed package-shaped file, missing file, orphan, or hash drift.

Thus `notes.md`, an editor backup, a user modification, or an uncommitted orphan blocks package deletion. pi-career never partially selects “safe-looking” files around unknown content.

The deletion preview includes complete exact bytes and metadata for every file and the final directory, fits the global preview bound, and warns that backups/snapshots/sync/provider/RPC/session copies are unaffected. After unchanged editor return, a separate destructive confirm names the mutation/application UUID and exact object count. Locked revalidation repeats every check.

After the cancellation cutoff, deletion unlinks one exact revalidated package file at a time, verifying inode identity immediately before each unlink. Content files are removed before metadata; `application.json` is last. The application directory is removed only if then empty and still the planned inode. The root is synced after directory removal. The root marker and root directory are never removed by application deletion.

A failure after any unlink returns `workspace_deletion_status_unknown`, settles all open handles, syncs where possible, and does not retry or claim rollback. Reconciliation reports what remains. Deletion is ordinary unlinking, not secure erasure; storage media, journal, snapshots, backups, sync, RPC, session, and provider copies may remain.

## Stable failures and privacy

Workspace implementation uses stable bounded codes including:

- `interactive_mode_required`
- `workspace_config_invalid`
- `workspace_root_invalid`
- `workspace_root_overlap`
- `workspace_unavailable`
- `workspace_identity_conflict`
- `workspace_limit_reached`
- `workspace_busy`
- `workspace_collision`
- `workspace_drift`
- `workspace_preview_changed`
- `workspace_verification_failed`
- `workspace_status_unknown`
- `workspace_deletion_blocked`
- `workspace_deletion_status_unknown`

Errors and logs contain no resume/vacancy/artifact text, company/role labels, absolute/relative path, hash, UUID, environment/platform detail, inode, temporary name, raw filesystem error, stack, provider data, Core output, or executable information. Fixed UI status may show bounded labels and privacy-reduced paths; exact paths/hashes/content appear only in the local preview/confirmation/success UI. Nothing is logged at the adapter boundary.

## Threat model

| Threat | Required mitigation |
|---|---|
| Agent/model initiates persistence | `/career-workspace` is user-only, absent from tools, accepts no arguments, and never auto-runs after a model/Core result. |
| One consent is reused for another surface | Session, provider submission, workspace, artifact, and deletion are independent; each file mutation has unchanged full preview plus separate confirm. |
| Edited preview changes content/path | Editor return must be byte-identical; all bytes and paths are regenerated/revalidated under locks. |
| Application mixes company contexts | One active UUID per fresh session; full UUID in immutable manifest; reattach only by exact UUID. |
| Transient session is mistaken for temporary files | Explicit warning and identical file consent; restart cannot reconstruct transient identity or handle. |
| Workspace enters original scanning | Canonical roots must be disjoint in both ancestor directions; every later config writer rechecks and preserves that invariant; no broad name exclusion is added. |
| Root/path traversal or alias | Canonical absolute bounded root, no symlink components, direct-child generated basenames, owner/mode checks, path bounds, inode/containment revalidation. |
| Unmarked existing data is adopted | Only empty unmarked roots or exact valid marked roots; unmarked nonempty roots/application dirs are never adopted. |
| Existing file is replaced | Workspace/artifact finals use exclusive temp plus no-clobber hard link; immutable revisions; collisions do not pick another name. |
| User edit is silently lost | Referenced hashes/types/owners/modes/link counts are verified before mutation; drift blocks and is never rewritten or deleted. |
| Vacancy normalization output replaces input | Persist exact accepted `VacancyEntry.vacancy_text` bytes only; no Core call or Core output during save. |
| Assisted text becomes authoritative | Only current materialization is eligible; exact v2 sidecar publishes first; state binds it; app root is outside resume roots. |
| Stale/foreign/evicted variant is saved | Session registry ownership, operation/schema/authority, selected-change, source binding, fresh uncapped scan, and active UUID checks occur before and after confirmation. |
| PDF styling is lost | PDF selected originals may be referenced by digest, but PDF variants/artifacts are ineligible; no extracted text is saved as a styled resume. |
| Concurrent writers fork state | Sorted queues, config/root locks, parent hash, deterministic next sequence, and no-clobber publication give one winner; loser returns drift/collision. |
| Crash exposes a half transaction | Commit-record-last ordering, file/directory sync, inode-aware cleanup, explicit orphan states, and read-only reconciliation. |
| Crash-left lock is broken unsafely | No waiting/polling or automatic stale-lock removal; it blocks with a stable error. |
| Immutable revisions exhaust directory/preview bounds | Exact root/application entry, revision, managed-byte, and preview ceilings are checked before preview and under lock; overflow is read-only and never compacted or partially trusted. |
| Deletion removes user/unknown data | Current UUID only, complete-chain and complete-entry proof, full deletion preview, separate destructive confirmation, unknown/drift/orphan hard block. |
| Delete is mistaken for secure erase | Ordinary unlink only; explicit backup/snapshot/sync/RPC/session/provider/media retention warning. |
| Private data leaks in metadata/errors | Manifests contain bounded workflow metadata/digests only; no document bodies/absolute source paths/provider/Core output; errors/logs are payload-free. |
| Workspace unexpectedly invokes network/Core/provider | Local filesystem and fresh local scan only; spies must prove no resolver, child, network, Core, provider, session append, or telemetry call. |
| Same-user hostile process defeats path checks | Explicitly outside v1 isolation claim; private roots, locks/no-clobber/inode checks address cooperating and benign races only. |
| Unsupported Windows reaches persistence | Package metadata and initialization guard reject before command registration, config read, root access, or private input. |

## Synthetic acceptance-test matrix

All fixtures use synthetic company, role, vacancy, and resume text. No real document, session, credential, provider body, machine-local path, or Career Core checkout is written or modified.

| Area | Required cases |
|---|---|
| Config migration | Fresh ordinary setup safely bootstraps only private `career/` and writes canonical v1; ordinary setup/library/root-removal/variation edits keep absent/v1 config at v1; only confirmed Configure application root maps strict v1 with/without variation suggestion or absent config in a pre-existing valid private directory to exact canonical v2; workspace missing/unsafe config directory fails; every later writer preserves v2 and uses shared locks/CAS; later library/variation mutations reject application-root equality, both ancestor directions, and aliases; complete old/new preview; cancel/edit/false confirm causes zero mutation; mode/owner/link/symlink-component/noncanonical/oversize/UTF-8/BOM/duplicate/unknown-key failures without permission repair; both exact config-lock kinds/bytes; config race changes expected hash and prevents replacement; crash yields absent, complete v1, or complete v2. |
| Root validation | Existing canonical `0700` owner root succeeds; absent, relative, noncanonical, control, overlong, symlink-component, wrong-owner, wrong-mode, special-bit, inaccessible, unsupported-sync cases fail; library equality, application-under-library, and library-under-application all fail by components and inode alias. |
| Root marker/adoption | Empty root exact marker/config success; marker bytes/order/mode/owner/link verified; crash marker-only can later attach; valid marked root audits; unmarked nonempty (including one hidden file), invalid marker, unknown root child, and present lock never adopt. |
| Initialization | Requires active canonical application UUID and unchanged session; exact slug and full-UUID collision behavior; no object before preview/confirm; exact `0700` directory; manifest exact bytes exclude labels, slugs, directory/path, status, and private content; optional workflow-original vacancy, state-1 parent hash, commit order, fsync, and restart reattach. |
| Session isolation | Earliest identity entry versus later state entries; same-UUID label/timestamp drift; fresh-session rule, application clear, branch before/after entry, two sessions with different UUIDs, same UUID branches, persisted restart, config detach/reattach, and transient shutdown all follow the identity rules without disk-driven session resurrection. |
| Lifecycle update | Status-only immutable state; first/later vacancy names; exact session vacancy bytes and no added newline; vacancy clear retains old file; selected-original fresh unique uncapped document/root/digest/format binding; changed/capped/assisted/PDF-as-artifact original cases; no silent session/file direction choice. |
| Drift | User edit to manifest/state/vacancy/marker/config blocks appropriate mutation; unknown noncolliding app file is ignored by append but blocks deletion; unknown collision blocks; malformed/gapped/forked state-shaped files fail closed; originals remain byte-identical. |
| Resume artifact (later gate) | Exact current variant schema/authority/selected changes/source binding; Markdown/text only; exact `resume.md`/`.txt` bytes; existing v2 sidecar bytes and sidecar-first order; absent selected binding set atomically; different binding, PDF, stale/foreign/evicted handle, malformed Unicode, empty/oversize text, existing path, and `/career-save`-only consent reject. |
| Preview and modes | Canonical complete envelope and byte ceiling; TUI and RPC success; any editor byte change, cancellation, timeout, malformed confirm, session change, non-idle state, print/JSON, and unsupported platform produce no mutation. RPC retention warning is visible. |
| Crash/failure injection | Before/after every mkdir, open, write, file sync, chmod/stat/read, link, unlink, state commit, directory sync, verification, config rename, and lock release; marker-only, empty dir, manifest-only, vacancy orphan, sidecar orphan, pair-without-state, state-committed, temp, and lock fixtures classify exactly as documented. |
| Concurrency | Two config writers, two initializers for one UUID, two applications in one root, competing next state, competing resume save, colliding temp/final, and cancellation while waiting for in-process queue; deterministic lock order, immediate cross-process busy, one commit winner, no deadlock/poll/retry. |
| Idempotency | Repeated exact status/vacancy/init is read-only; exact state found after ambiguous error is success; changed plan never reuses confirmation; restart never reconstructs variant from artifact/sidecar. |
| Deletion (later gate) | Exact known-only directory full preview and deletion; cancel/edit/false confirm zero changes; unknown/user file, subdirectory, symlink, hard link, drift, orphan, temp, lock, malformed metadata, and oversize preview all block; failure after each unlink returns unknown and never claims rollback/erasure; marker/root remain. |
| Side effects | Spies prove every workspace action performs no Core/runtime resolver/provider/model/network/child-process/telemetry call, opens no private child stdin, appends no session entry, logs no payload, and writes only approved config/marker/one application directory/temp-lock paths. |
| Bounds and errors | Root entries 1,023/1,024/1,025; application entries 159/160/161; revisions 63/64/65; the maximum 131-entry package set; managed bytes and preview just below/at/above each ceiling; over-limit reconciliation and locked race checks; payload-free `workspace_limit_reached` and other stable errors with no private strings, paths, hashes, UUIDs, raw errors, or stacks. |
| Package contents | Deterministic build/package tests prove no synthetic workspace, fixture, native binary, runtime dependency, lifecycle script, `node_modules`, Pi peer contents, backup, temp, or lock enters the tarball; current exact peer/runtime/package policies remain unchanged. |
| Platforms | Local filesystem acceptance on supported macOS and Linux covers modes, owner checks, hard links, file/directory sync, locks, and crash cases. Windows/direct unsupported initialization proves no command registration or config/root/private access. |

The repository's normal verification ladder, changed-file security review, and architecture review remain mandatory for every future implementation phase.

## Implementation phases and separate approval gates

### Gate 0 — design review only

Review this document for product, privacy, filesystem, session, and threat-model completeness. Approval changes no code and authorizes no implementation, merge, release, publication, or tag.

### Gate 1 — bounded first slice (implemented in unreleased source; under review)

The approved implementation includes only:

- strict config v2 migration and config CAS;
- existing-private-root validation, two-way library disjointness, root marker, and attach/detach;
- `/career-workspace` with the first-slice menu;
- immutable manifest/state chain;
- application initialization and status/selected-original/vacancy/vacancy-clear revisions;
- read-only reconciliation, payload-free failures, and synthetic tests.

Gate 1 excludes resume artifacts and all package deletion. The implementation still requires independent security/architecture review and full repository verification before merge consideration; it is not release authorization.

### Gate 2 — assisted resume artifact

Only after Gate 1 acceptance and separate explicit authorization, implement `Save current assisted resume` using the current materialization eligibility, existing v2 sidecar authority, artifact-specific preview/confirm, sidecar/artifact/state commit ordering, and artifact tests. This gate does not authorize PDF/DOCX, cover letters, notes, changes, provider output, full results, replacement, or `/career-save` convergence.

### Gate 3 — deletion

Only after retained-file behavior and crash reconciliation have real macOS/Linux acceptance, separately authorize exact-known-only current-application deletion. This gate does not authorize root deletion, unknown-file cleanup, secure erasure claims, retention automation, or arbitrary application/path selection.

### Gate 4 — later workspace scope

Cover letters, notes, interview files, user-file adoption, additional resume revisions, styled formats, exports, repair, archive, sync, and broader application management each require a new design and approval. None is implied by Gates 0–3.

Release, publication, tagging, deployment, and full application-workspace scope always remain separate owner decisions after implementation review. Design approval alone authorizes none of them.
