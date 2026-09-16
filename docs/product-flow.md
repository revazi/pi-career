# Product flow roadmap

The cross-repository migration plan and measured findings are recorded in [`career-run-roadmap.md`](career-run-roadmap.md). Career Core Phase 8, the first managed `career_run` implementation, the threat-reviewed package-owned Markdown/text save workflow in [`variant-save-workflow.md`](variant-save-workflow.md), and application-workspace Gate 1 in [`application-workspaces.md`](application-workspaces.md) are implemented. Synthetic PDF compatibility covers reviewed Chromium-generated tagged/untagged and ReportLab-generated two-page documents, embedded-font and multi-column layouts, and fail-closed text-unavailable cases. The Git-history/tree/hash-bound token-optimization study is complete: its frozen before/after evidence includes Pi Skill discovery and matching-task full-Skill context and records a 15.98% aggregate workflow reduction with no workflow regression. Application-workspace assisted resume artifacts, deletion, repair/adoption/archive/sync, broader workspace files, and further PDF extraction expansion remain later separately approved phases.

## Approved target: `/career` as a local Pi application

The application-centric roadmap treats `/career` as a user-invoked modal application inside Pi. It is not a chat prompt, model command, or full-screen replacement for Pi. Its execution model has three separate planes:

| Plane | User trigger | Execution boundary | Model/session effect |
|---|---|---|---|
| Overlay navigation | Open `/career`; browse, search, filter, open local detail, or review readiness | Local extension UI and bounded filesystem reads | No provider/model call, message submission, Career-specific model context, attachment, or session append |
| Deterministic work | Explicit Analyze or Match action | Career Core through the reviewed resolver, with existing compatibility, stdin, cancellation, and output bounds | No provider/model call or model-context activation; only separately approved persistence may append or write |
| Model assistance | Explicit Ask Pi/Regenerate/Suggest/Explain action followed by review and ordinary user submission | One application-scoped Pi assistance session using the bundled Skill and primary `career_run` tool | Career context and tokens begin only for this action; no package-initiated submission |

“Token-free overlay” means the first two planes cause no model turn and add no Career document, result, Skill content, or tool contract to a model request. The target also removes Career-specific Skill discovery metadata and tool schemas from ordinary Pi sessions that have not been explicitly activated for Career assistance. A local Core operation can consume CPU and may perform the already bounded exact-package acquisition before private stdin; it still consumes no model tokens. `PI_OFFLINE=1` disables that acquisition for offline testing/use but is not required for normal overlay operation.

### Read, cache, and refresh contract

One overlay open or explicit refresh takes one bounded catalog snapshot. List views use only that projection and never read every document body. Exact document bytes and larger local details are loaded lazily only after the user opens the corresponding detail or starts an eligible action. Derived readiness is calculated locally from validated current metadata; it is never persisted or model-derived.

Catalog, detail, and rendered-view caches are process-memory-only, bounded, and scoped to the current overlay instance. Closing the overlay drops UI/search/filter/cursor state. There is no persisted index, background watcher, polling loop, URL fetch, or speculative Core/model work. Returning from a dialog or completed mutation refreshes the affected bounded projection. Explicit Refresh replaces the snapshot only after a complete valid scan; cancelled or partial reads never masquerade as fresh complete state.

Before any mutation, Core invocation, attachment, or model handoff, the adapter revalidates the selected identity, root, referenced bytes, and action prerequisites under the owning workflow’s race rules. Drift invalidates the action and requires a fresh view; cached display data never becomes write, Core, or prompt authority.

### Session and model-context boundary

Browsing never attaches an application. An explicit application attachment, when implemented by #64, stores only a bounded application/root identity pointer in a Pi custom entry after the separate session-persistence decision; it stores no document, result, prompt, or provider content and does not itself activate a Career Skill/tool or authorize provider submission. Workspace files remain the application authority.

An explicit assistance action revalidates the application and uses one company/role per assistance session so prior-company conversation content cannot leak into another application. The action may prepare a visible editor message and may establish a fresh application-scoped Pi session, but it must never call `sendMessage()`, `sendUserMessage()`, or an equivalent automatic submission path. Only the user’s later ordinary submission activates the provider boundary. Within that explicitly activated assistance session, the Career Skill and compact `career_run` contract remain stable rather than being toggled every turn, preserving prompt-cache reuse. The exact raw compatibility tools remain inactive unless the user explicitly requests raw/debug mode.

Restart, `/new`, branch, detach, unavailable-root, and identity-drift behavior must revalidate the bounded pointer and fail closed; no session is reconstructed from workspace files alone. Overlay route state and cached private bytes are never written to the Pi session. Session persistence, application attachment, assistance activation, provider submission, artifact mutation, and deletion are distinct approvals.

### Ordered delivery and acceptance invariants

Persistence foundations #60–#65 remain ahead of overlay implementation. #64 owns the exact attachment and command-authority contract and must also specify the context-on-demand activation lifecycle without inventing a second application authority. After those foundations are accepted, #54–#58 deliver the Resume, application, match/tailoring, cover-letter, and integrated overlay slices; #59 validates the complete product.

Every overlay slice must prove with synthetic scenarios that:

1. opening, closing, resizing, browsing, filtering, searching, and local detail navigation make no provider/model call, submit no message, append no session entry, and activate no Career-specific model context;
2. list rendering uses one bounded metadata snapshot and does not read document bodies;
3. local Analyze and Match remain explicit, cancellable Career Core operations with zero model calls/tokens;
4. cached state is revalidated before mutation, Core use, attachment, or handoff, and observed drift fails closed;
5. only an explicit assistance action may prepare Career model context, and preparation remains visibly reviewable without automatic submission;
6. application attachment neither implies assistance activation nor provider or mutation consent;
7. `career_run` remains the primary managed tool once assistance is active, while `career_core_discover`, `career_core_resume`, and `career_core_job` retain their exact compatibility names and stay inactive by default;
8. branch/session replacement clears process-local handles and uses only the fresh Pi context;
9. no persisted index, watcher, prompt/result cache, document duplication, telemetry, or background work is introduced; and
10. benchmarks report ordinary model turns outside activated Career assistance sessions as zero Career-specific context tokens, separately from activated workflows, and preserve stable activated-session surfaces for prompt caching.

This section is an acceptance contract and delivery order, not implementation approval. It does not claim that `/career` or context-on-demand activation exists in the current source.

## Implemented current phase: managed agent tool and deterministic slash commands

The normal active model surface is one compact `career_run` tool. The exact raw compatibility tools remain registered but inactive until `/career-tools raw` explicitly enables them:

- `career_core_discover`
- `career_core_resume`
- `career_core_job`

It also registers:

- `/career-setup` for library/privacy onboarding and a suggestion-only preferred variation directory—not external CLI installation
- `/career-library` for explicitly configured searchable PDF, Markdown, and text resume roots, with actionable extraction notices
- `/career-application` for session-scoped company/role identity and vacancy/result isolation
- `/career-vacancy` for bounded vacancy input after session-persistence consent
- `/career-match` for deterministic multi-resume matching and conservative ranking
- `/career-analyze` for deterministic single-resume readiness detail
- `/career-workbench` for a bounded, guided, visibly reviewable rebuild handoff to the user's normal Pi editor
- `/career-review` for TUI-only, bounded inspection and explicit selection of current non-PDF retained variant changes
- `/career-save` for user-only TUI/RPC exact preview, confirmation, and no-clobber local saving of one current Markdown/text materialization
- `/career-workspace` for user-only no-argument TUI/RPC Gate 1 root configuration, immutable application state/vacancy/original binding, and read-only reconciliation
- `/career-tools` to switch between the managed-only and advanced raw model-tool surfaces

`career_run`, the raw compatibility tools, `/career-vacancy`, `/career-match`, and `/career-analyze` invoke the compatible Career Core route selected by the external resolver on supported macOS/Linux systems. Package metadata rejects other systems, and direct local/Git extension initialization registers no command/tool and fails with `unsupported_platform` before route work or private stdin. Managed compatibility is validated before private input, and the reviewed exact package may be acquired only after local routes fail unless `PI_OFFLINE=1`. `career_run` validates Phase 8 operation/schema contracts internally, resolves current originals/vacancy through ephemeral handles, keeps complete results in bounded process memory, and exposes compact detail hydration without nested `input_json`. Setup/library scanning remains local. `/career-application` manages consented session state only. `/career-workbench` does not invoke Core or a provider/model itself: it prepares an ordinary editor message containing one original resume and, only for tailoring, the current vacancy. Guided modes cover complete score explanation, reviewed improvement suggestions, a question-led factual interview before reviewed replacements, direct reviewed exact replacements, and vacancy-specific variant review. The user must review and submit that message separately through Pi. `/career-review` also invokes neither Core nor a provider: it reads one current in-memory non-PDF variant review, requires warnings/discards acknowledgment and exact per-change inspection before inclusion, then prepares a later editor message containing only the unchanged review handle and selected canonical IDs.

Binding boundaries:

- no package-initiated provider/model calls or automatic submission; the workbench stops at a reviewable editor prompt, and only the user's later ordinary Pi submission may contact the selected provider; exact-package acquisition before private stdin is the sole network-capable adapter-runtime behavior
- agent-directory-relative non-sensitive config only; it may contain canonical library roots and one bounded absolute preferred variation-directory suggestion
- no resume or vacancy text in global config; a variation-directory preference is destination guidance, not write approval
- session entries only after explicit persistence consent; entries persist to JSONL even when excluded from model context
- one company/role per Pi session; application IDs scope vacancy/result state and `/new` prevents prior company prompts from remaining in the next application conversation
- original resumes only for deterministic analyze/match
- assisted variants remain labeled and excluded from authoritative reranking
- stable path/id tie-breaking; any close-cluster label is a UI heuristic, not a Core result
- cancellation aborts the active child and stops remaining batch work
- complete slash-command Core results remain transiently inspectable through a read-only pager; managed full results/exact review inputs remain only in a 16-entry/64-MiB ephemeral registry, and no full JSON is added to session state or written to a file
- searchable PDF text extraction is local and isolated with fixed byte/page/time/memory/result ceilings; OCR and document rewriting remain out of scope
- workbench prompts keep originals immutable, omit absolute source paths, treat document text as untrusted data, rerun complete deterministic baselines after submission, and require Career Core review of external suggestions, replacements, and variant changes
- workbench prompts may include a privacy-reduced preferred variation-directory display path from setup; the selected agent recommends it first only after a separate user request and receives no automatic write authority
- review proposals use verbatim source targets and in-range evidence, prefer single-line targets, make one review attempt, and surface discard codes instead of model-led repair/retry loops
- `career_run variant-review` terminates its turn; the TUI selector defaults every retained change to excluded, pages exact before/after/evidence locally, then pages selected changes together as compact labeled exact records, permits direct final-stage reopening of each record, and requires a separate prepare-or-back decision
- review selection is process-memory-only: only the final prepare choice puts the ephemeral review handle and selected canonical IDs in the editor; pi-career appends no selection entry and performs no Core call
- PDF review changes remain manual guidance; `/career-review` and `career_run materialize` reject PDF review handles because extracted text cannot preserve the styled document
- raw tool JSON remains authoritative; managed projections refer to complete authoritative in-memory results by handle, while prose hydrates only requested evidence and retained items
- PDF workbench output is suggestion-only because extracted text cannot expose or preserve visual layout; Markdown/text prompts require existing structure and unchanged wording to remain intact
- no full-result file export; `/career-save` persists only exact approved assisted document bytes and bounded marker/sidecar metadata
- `/career-workspace` is absent from model tools, calls no Core/runtime/provider/model/network/child process, appends no session entry, and persists only separately previewed Gate 1 config/marker/manifest/state/vacancy metadata under one strict disjoint private root

The approved workflow specification fixes command behavior, persistence format, non-TUI behavior, bounded UI, and cancellation ownership. Print/JSON modes fail closed except for the pure `/career-vacancy clear` state action. Company/role isolation and implemented Gate 1 application state persistence follow the separate [`application-workspaces.md`](application-workspaces.md) contract. Workspace-assisted artifacts and deletion remain unimplemented Gates 2 and 3.

## Assisted handoff and later materialization

The current workbench prepares private context in Pi's editor only. It does not call a model, hide the source payload, or write a document. Submitting is the user's separate provider action. The prompt directs the selected Pi agent to start with `career_run context`, use internal exact Phase 8 contract discovery, rerun and preserve complete deterministic baselines behind ephemeral handles, and pass external suggestions, replacements, or variant changes through the corresponding Career Core review before presenting them. The question-led rewrite mode reviews first, asks one bounded batch of user-verifiable factual questions, and waits for a later turn before drafting or reviewing exact replacements.

For a non-PDF vacancy-specific variant, the first assisted turn stops mechanically after review. In TUI, the user can run `/career-review <review-handle>` to page all warnings/discards and exact retained changes. Every change starts excluded and can be included only from its exact detail view. Continuing pages all selected exact records together with compact labels and permits direct read-only reopening of each one; a separate final choice either returns to review or prepares—but never submits—the later user message with exactly the selected Core IDs and unchanged handle. Only after the user reviews and submits that message may deterministic materialization run. The result remains assisted/non-authoritative and cannot enter authoritative analysis or matching. PDF workbenches stop after reviewed targeted changes for manual application; PDF handles are rejected by selection and materialization and never turn extracted text into a styled resume.

Automatic variant saving remains prohibited. Setup records or derives only a preferred destination suggestion and creates no directory or file. After a successful non-PDF materialization, the user may separately run `/career-save <variant-handle>`: it derives an eligible direct-child managed destination, shows the complete exact plan, requires unchanged preview plus separate confirmation, performs no-clobber private writes, and succeeds only after fail-closed rescanning excludes the artifact from originals. It does not add provider fallback, automatic repair/retry, original overwrite, auto-application, or authoritative reranking.

## Non-goals in this phase

- package-initiated provider/model clients, credentials, automatic prompt submission, or full-screen UI
- DOCX/OCR/URL ingestion; image-only PDFs require external OCR or export
- source-document or full-Core-result persistence outside the approved config/custom-entry workflow
- source document mutation
- career-document publication/export, release-asset downloads, signing, or notarization
- package-owned native binaries or platform claims beyond pi-career's six reviewed macOS/Linux targets; the launcher's additional upstream manifest entries are contract metadata, not support
