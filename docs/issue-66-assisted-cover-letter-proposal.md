# Issue #66 — operator-mediated assisted cover-letter drafting

**Status: proposed specification and threat model; production implementation blocked.** The separately authorized [Pi 1.0.4 boundary probe](issue-66-pi-1.0.4-probe-report.md) now supplies synthetic executable research evidence, but it adds no product behavior and found that the required final-prompt, isolation, lifecycle-correlation, and generic RPC guarantees cannot be proved through the current public contract. Production implementation still requires a different reviewed host/API contract plus separate owner approval. Existing cover-letter behavior remains governed by [cover-letter-contract.md](cover-letter-contract.md) and accepts only genuinely `user_authored` content.

## 1. Decision and scope

The proposed MVP is a **transient, operator-mediated drafting and local-review flow** for one currently attached application. It may proceed only when all of these conditions remain true at every applicable boundary:

- the Pi session is ephemeral (`ctx.sessionManager.getSessionFile() === undefined`, normally `pi --no-session`);
- one application attachment is valid and current;
- the application has a current job description and a current effective Resume;
- the effective Resume authority is explicitly identified as `original` or `tailored`;
- the user explicitly starts drafting after any assistance-activation reload has completed;
- the user reviews the visible handoff and uses ordinary Pi submission as the sole provider-consent action; and
- any later candidate enters local review only through an explicit user paste, while the same process-local source-bound attempt remains valid.

This proposal does not add a provider client, credential access, hidden submission, automatic response capture, transcript scraping, web research, employer submission, automatic save, or model-callable drafting tool. It does not authorize assisted Resume creation or mutation. Career Core does not draft, review, or certify cover-letter prose or factual truth.

The proposed content authority is exactly `model_assisted_non_authoritative`, distinct from `user_authored`. Editing, reviewing, approving, or manually pasting assisted-derived text does not upgrade its authority. The current user-authored writer cannot be used as an assisted-content persistence bridge.

## 2. Current behavior and evidence

### 2.1 Implemented behavior that remains unchanged

Current application attachment and assistance activation use path-free custom session entries. Activation appends an existing non-private activation pointer, places the document-free Career handoff in the editor, and calls `ctx.reload()` without submitting it. Current tests establish that an ephemeral session retains its in-memory session entries across that same-process reload and loses them on process restart. Persistent activation can be reconstructed from session entries after restart. Neither result means extension-local variables survive reload.

The existing managed surfaces, compatibility names, and persistence contracts remain unchanged:

- `career_run` remains the primary managed tool;
- `career_core_discover`, `career_core_resume`, and `career_core_job` remain the exact raw compatibility names;
- `pi.career.application_state` remains the sole canonical application-state identifier;
- former or unknown state identifiers fail closed without migration or prefix compatibility;
- the current cover-letter parser/writer accepts only `authority: "user_authored"`; and
- existing exact-preview, confirmation, lock, no-clobber, capacity, concurrency, crash-settlement, payload-free-error, and privacy rules remain in force.

### 2.2 Pi 1.0.4 API facts relevant to feasibility

The reviewed Pi documentation and installed declarations establish the following:

- Reload replaces the extension runtime. Code after `await ctx.reload()` belongs to the old runtime and must not reuse session-bound state.
- Reload emits `session_shutdown` with reason `reload`, loads a replacement extension runtime, emits `session_start` with reason `reload`, and then performs `resources_discover` with reason `reload`.
- `session_start` reasons are `startup|reload|new|resume|fork`; `session_shutdown` reasons are `quit|reload|new|resume|fork`; `session_tree` follows branch navigation.
- `input` exposes submitted text, input source, optional images, and streaming behavior before later prompt processing. It may continue, transform, or handle the input. A thrown `input` handler error is reported and processing continues, and later handlers may transform or consume text already validated by an earlier handler.
- `before_agent_start` sees the raw user prompt after Pi expansion, but its declared result is not a general prompt-cancellation gate. A package cannot invent a final cancellable provider-payload hook from these APIs.
- `context_with_system` and `before_provider_request` can replace later request material. Their handlers compose in load order, thrown handler errors are reported while processing continues, and a later handler may replace an earlier result; neither supplies an exclusive fail-closed final guard.
- Provider/message hooks exist, including `after_provider_response`, `provider_stream_event`, and `message_end`. Their existence does not authorize this package to capture provider output.
- Ordinary user, system, assistant, tool, and metadata appends advance the session leaf. Leaf change is therefore not equivalent to branch navigation and cannot unconditionally invalidate an attempt that is expected to survive its own run.
- Accepted input may fail model/authentication preflight without `agent_start` or final settlement. `agent_settled` has no outcome field; `agent_before_settle` exposes `completed|aborted|error` but may be skipped on some abort paths.
- Active model-declared tools and registered callable tools are different sets. `codemode`/`deferred` tools may remain callable without being active declarations, and the current Career `input` handler refreshes the Career tool surface.
- `ctx.ui.setEditorText()` is direct in TUI but fire-and-forget in RPC; an RPC client may ignore it. RPC `editor()` is a request/response dialog, but Pi exposes no authenticated evidence that a later RPC `prompt` was a distinct human action rather than automatic client behavior.
- Pi adds a submitted ordinary message to the active branch. Sessions persist by default, and user/assistant messages are written to session JSONL unless Pi was started with `--no-session`.
- The provider request includes ordinary Pi system/context material and active-branch history in addition to the handoff. Retry, recovery, compaction, cache warming, queued work, and later turns may reuse context under Pi's own lifecycle.
- Compaction and context edits do not erase raw session history. Session export/share may expose prompts, responses, tool arguments, and other private content.

These facts rule out the earlier idea that a private process-local source snapshot could safely span the activation reload. They also rule out claiming “no prompt/response persistence” in an ordinary persistent Pi session, treating handoff bounds as complete provider-request bounds, or treating one `input` check/empty active-tool list as a proved security boundary.

### 2.3 Executed Pi 1.0.4 probe evidence

The [boundary probe report](issue-66-pi-1.0.4-probe-report.md) and its synthetic tests establish that later input/request handlers can alter content already accepted by an earlier guard, handler exceptions do not stop processing, empty active tools can coexist with nested-callable tools, ordinary appends advance the leaf, and RPC exposes no authenticated human-action marker. Pi's all-tools denylist did remove registered/active/callable synthetic tools in one controlled host, but that does not sandbox extensions or establish exclusive lifetime ownership. These results block Phase B on Pi 1.0.4's current public contract.

### 2.4 Proposal-only behavior

A future implementation would add a separate cover-letter drafting action that is available only **after** assistance activation and its reload are complete. That action would create a visible, bounded handoff in the replacement runtime. It would not call `ctx.reload()` again as part of creating the handoff.

The ordinary submitted prompt would first be checked at `input`, but that check would create only a `validated_input_not_started` state, not eligibility. A future approved final-boundary and metadata-only lifecycle correlation would have to bind protected prompt bytes, current sources, branch lineage, observed start, positive completion, and final settlement before paste eligibility could exist. Pi would own the provider request, display, errors, and ordinary transcript. The package would not inspect or copy the assistant response. A later local review action could accept one explicit user paste only if every currently blocking correlation and isolation requirement had been proved.

## 3. Proposed contract

### 3.1 Privacy prerequisite and consent

The drafting action must refuse when `ctx.sessionManager.getSessionFile()` is defined. The notice must explain that normal Pi submission persists the complete prompt and provider response and direct the user to start a separately reviewed `pi --no-session` run, attach the application there, activate assistance, and retry.

`--no-session` prevents Pi session-file persistence; it does not promise secure erasure. The TUI, RPC client, terminal scrollback, editor, OS, provider, and provider-side systems may retain submitted or displayed content. Those limitations must be visible before handoff. npm cache behavior remains unrelated and unchanged.

The only provider-consent action is the user's ordinary Pi submission of the visible handoff. The package must not call `ctx.modelRegistry.streamSimple()`, `pi.sendUserMessage()`, `pi.sendMessage(..., { triggerTurn: true })`, a provider API, or any network client for this flow.

### 3.2 Eligibility and source authority

The action accepts no application ID, path, provider, model, temperature, or executable/tool argument. It operates only on the currently attached application reconstructed from the active branch and exact validated workspace pointer.

The source snapshot contains in process memory:

1. session ID, a pre-submission branch anchor, and a future reviewed navigation/run generation identity;
2. attachment, application, and activation IDs;
3. exact resolved job-description UTF-8 text bytes and digest;
4. exact resolved effective Resume UTF-8 text bytes, text digest, document binding, and authority (`original` or `tailored`);
5. bounded company and role labels; and
6. the exact explicit facts/instruction accepted from the visible handoff.

No arbitrary Resume fallback is permitted. If tailored is the current effective authority, the original cannot silently replace it. For an original PDF, “text” and its digest mean the existing validated scanner/extractor output after its current newline normalization, not raw PDF bytes; tailored text comes from the validated managed artifact. Raw-file identity, resolved text identity, and workspace binding must not be treated as interchangeable. Missing, ambiguous, stale, drifted, over-capacity, or unavailable sources fail closed.

The implementation must re-read and compare current source identities and digests:

- before constructing the handoff;
- in `input`, before ordinary submission is allowed;
- before accepting a pasted candidate;
- before each claims/review preview; and
- immediately before any future authorized persistence preview and again under its application lock.

A changed source never rebinds an old prompt or pasted candidate. It invalidates the attempt and requires a new explicit drafting action.

### 3.3 Reload-safe lifecycle

The lifecycle is deliberately two-stage:

1. **Activation stage:** existing attachment/activation behavior may reload Pi to expose the existing Career surface. No cover-letter attempt or source snapshot exists yet.
2. **Drafting stage:** after the replacement runtime has completed `session_start` and resource discovery, the user explicitly invokes the cover-letter drafting action. The new runtime reads current sources and prepares the full handoff without another reload.

This removes any need to carry private source state across activation reload. A reload at any later point invalidates the attempt. So do shutdown, restart, new/resume/fork, actual tree navigation, attachment loss, session-ID change, source drift, cancellation, or a second competing attempt. Ordinary append-driven leaf advancement is expected during a run and must not itself invalidate. A future design must define a pre-submit anchor plus narrowly permitted run-owned descendant progression using metadata/lineage only; navigation, unrelated turns, unexpected ancestry, and intervening work must invalidate. No such generation/lineage contract is approved yet.

At `input`, a reserved, non-command handoff grammar would have to reject images, extension-originated submission, stale session/source state, duplicate submission, missing sections, reordered or changed protected source sections, and over-bound editable sections. The user may edit only explicitly marked facts and instruction fields. Company/role labels and exact source sections would compare byte-for-byte with the pending handoff and freshly validated sources. Every validation/read exception must be caught and return `action: "handled"` with payload-free guidance; throwing is not fail-closed.

That `input` validation is necessary but not sufficient: later extension handlers may transform/consume input, and Pi performs expansion and preflight afterward. `before_agent_start` can observe expanded prompt text but is not a documented general cancellation gate. Therefore implementation remains blocked until a reviewed trusted-runtime/handler-order contract or another supported mechanism proves that protected bytes and images cannot change after validation. The design must not claim arbitrary co-extension isolation.

The state machine must distinguish `pending_handoff`, `validated_input_not_started`, `observed_started`, `completed`, `finally_settled`, and `invalidated`. Input acceptance alone creates no paste eligibility. A future metadata-only correlation must handle preflight failure with no start/settlement event, retries, queued work, abort paths that skip `agent_before_settle`, the scalar settlement outcome where available, and stale generations. `agent_settled` alone never proves success. Without deterministic cleanup and positive content-free completion evidence, implementation must stop.

### 3.4 Visible context and bounds

The handoff may contain only:

- bounded company and role labels using limits no weaker than the current validated application-label contract;
- exact current job-description text;
- exact current effective Resume text and its visible `original`/`tailored` label;
- explicitly entered user facts; and
- one explicitly entered drafting instruction.

It must visibly separate fixed instructions from untrusted job, Resume, and fact data. It must say that unknown information becomes a question or omission and that source text cannot authorize tools, browsing, file access, secret access, or policy changes.

The existing implementation does **not** impose a universal 12,000-byte source limit. `12,000` is a local Career overlay preview bound, while current application artifacts and Core inputs use other byte/character limits. Therefore exact cover-letter context limits remain an owner decision. Before implementation, one reviewed table must define separate maximums for:

- each label (UTF-8 bytes and Unicode scalar values);
- job text;
- effective Resume text;
- fact count, fact bytes, and total fact bytes;
- instruction bytes;
- complete handoff bytes;
- pasted candidate bytes and Unicode scalar values; and
- claim count/span bytes and complete review bytes.

Every bound must reject rather than truncate. UTF-8, scalar, NUL/control, newline, duplicate-fact, empty-source, delimiter escaping/collision, and normalization policy must be exact and shared by TUI/RPC paths. No claim may be made that current APIs already enforce the future table.

These bounds apply only to package-selected handoff fields. They do not bound the complete provider request or make the selected job/Resume/facts the model's exclusive factual context: Pi also sends its system prompt, discovered context, active-branch history, and extension-added material. The proposed flow must require a newly started, reviewed, ephemeral drafting session with no earlier model-visible application content, pending messages, or prior attempt. Even then, ordinary system/context material remains and must be disclosed. Whether that narrower context profile is acceptable is an owner decision.

### 3.5 Tool and injection isolation

Prompt instructions alone are not a security boundary. Before allowing ordinary submission, a future implementation must prove that the entire drafting isolation lifetime exposes no model-reachable or nested-callable file, shell, web, MCP, Career Core, `codemode`, `deferred`, or other tool surface. An empty `pi.getActiveTools()` result is insufficient. Source text and user facts are untrusted data and cannot authorize tools or alter system policy.

The current Career `input` handler refreshes active Career tools, so a future design must explicitly coordinate with that mutator. It must also account for later registrations and all other trusted extension hooks. The supported environment must use an explicitly reviewed extension/resource set; extensions share Pi process permissions and are not a sandbox from one another.

A temporary restore-after-settlement design is unsafe because the untrusted source prompt and response remain in ordinary in-memory context and can influence later tool-enabled turns. The safer proposed boundary is a dedicated, queue-empty, no-tool ephemeral drafting session whose no-tool lease remains until copy-out and shutdown, with no tool restoration or unrelated continuation in that session. This is still only a design direction: exclusive loadout ownership, callable-versus-declared reachability, compare-before-change behavior, retries, cache warming, queued/deferred work, competing commands, abort, reload, and shutdown must be proved. If any other actor can make a tool reachable or submit unrelated work, drafting remains blocked.

The model's non-invention instruction is guidance, not a proof. The package cannot guarantee that generated prose contains no unsupported claim. Local claims review must therefore remain advisory and human-controlled.

### 3.6 Provider result and explicit paste

Pi—not pi-career—displays the provider response and any provider refusal, timeout, rate limit, transport error, or malformed model output. This package must not inspect `provider_stream_event`, `message_end`, session entries, RPC event history, or any provider body to recover the draft.

Consequences:

- The package cannot claim to reject or discard an over-bound provider response before Pi displays it.
- Provider errors are governed by Pi's normal UI/RPC behavior, not converted into pi-career adapter errors.
- A scenario can prove that pi-career adds no raw error/body logging or persistence, but cannot claim Pi/provider wire secrecy from package tests.

Only after an observed start, a positively correlated `completed` outcome, final settlement, and unchanged generation/source state may the user invoke one local review action and explicitly paste one candidate. This sequence is a blocking feasibility requirement, not an established Pi contract; if it cannot be proved without inspecting assistant content, no candidate is eligible. The action accepts the paste only while that attempt remains valid and after current-source revalidation. The paste is bounded and validated locally. The user may paste the response unchanged or an edited version, but either remains `model_assisted_non_authoritative` and bound to the original source snapshot. The package neither proves that the paste came from the provider nor treats that provenance limitation as truth certification.

A paste after reload, restart, branch change, source drift, attachment change, failed/aborted run, or attempt invalidation is rejected. Text similarity, labels, session history, and a user assertion cannot recreate eligibility.

### 3.7 Claims review and authority

Claims review shows bounded spans or numbered candidate claims and asks the operator to retain, revise, remove, or convert each to a question. It must not label a claim “verified,” “true,” “Career Core approved,” or equivalent. It cannot infer facts from plausibility, company knowledge, the model name, or omitted source material.

Any operator edit creates a new transient candidate under the same `model_assisted_non_authoritative` authority and the same still-valid source snapshot. Approval does not promote authority. Career Core is not called to review prose.

The existing `user_authored` cover-letter action is not an authorized persistence route for model-assisted or assisted-derived bytes. Its UI and parser assert `user_authored`; sending assisted content through it would erase provenance and violate this contract. This is an operator/authorization rule and a prohibition on package-owned bridges, prefill, or automatic invocation—not a claim that the unchanged writer can detect arbitrary assisted text pasted after copy-out, editing, reload, or restart.

### 3.8 Persistence remains separately blocked

The MVP may end after transient review and explicit copy-out. It adds no artifact, state revision, sidecar, custom entry, prompt cache, backup, or recovery file.

Persisting assisted content requires an additional owner decision and implementation authorization because current project instructions prohibit unapproved payload persistence and the current parser accepts only `user_authored`. Any later authorized persistence design must:

- add exact `model_assisted_non_authoritative` parsing without accepting aliases or authority upgrades;
- retain `pi.career.application_state` as the sole state identifier, with no migration, history rewrite, or compatibility-prefix reader;
- document that older readers reject the new authority and fail closed rather than reinterpret or rewrite it;
- bind the artifact to the exact job/effective-Resume digests and effective authority;
- show an exact unchanged content/file preview;
- obtain a distinct artifact-persistence approval and the existing separate workspace-mutation approval;
- publish an immutable Markdown/plain-text artifact before committing state last;
- revalidate source/state before preview and under lock;
- preserve capacity, concurrency, crash settlement, collision handling, and no-clobber behavior; and
- never promote assisted content to `user_authored` because of edits or approvals.

Until that contract is separately authorized and implemented, the correct persistence result is “unsupported; copy-out only,” not fallback to the current writer.

### 3.9 TUI and RPC behavior

The validation/state machine must be shared. TUI may place the reviewed handoff in the main editor. RPC cannot assume `set_editor_text` was honored because it is fire-and-forget and clients may ignore it. An RPC flow must use the supported `editor()` request/response to expose the handoff, then require the operator/client to issue a separate ordinary `prompt`; `input` must compare the actual prompt with the pending handoff before allowing it.

No supported RPC client may automatically submit the editor response as part of the extension UI response. Pi cannot distinguish an auto-submitting client from a human-controlled client when both emit the same editor response and later `prompt` record, so operator mediation is an external trusted-client conformance requirement, not an extension-observable guarantee. Supported clients require separate review and negative tests; all others keep RPC drafting unavailable. Native custom TUI components are not a substitute because `custom()` returns `undefined` in RPC.

## 4. Threat model

| Threat | Required mitigation or fail-closed result |
|---|---|
| Persistent Pi session stores job, Resume, facts, prompt, and response | Refuse drafting unless `getSessionFile()` is undefined; explain remaining client/provider/OS retention. |
| Activation reload loses a private source snapshot | Create no attempt before reload; require a second explicit action in the replacement runtime. |
| Old handoff is submitted after source change | Reserved-envelope validation compares protected exact sections and freshly read identities/digests; every failure is handled rather than thrown. Final post-expansion integrity remains a blocking feasibility gate. |
| User edits protected job/Resume/labels | Exact structured parser rejects changed, missing, reordered, duplicate, or delimiter-colliding protected sections. |
| Later handler or Pi expansion changes validated input | Require reviewed ordering/trust and final-boundary evidence; if protected bytes/images cannot be proved unchanged, block drafting. |
| Job/Resume prompt injection requests secrets, browsing, or tools | Treat all sources as data; require a dedicated no-tool session through copy-out/shutdown; otherwise block before submission. |
| Model invents experience, employers, dates, metrics, motivation, or company facts | Fixed instruction requests omission/questions; bounded human claims review remains advisory and cannot certify truth. |
| Package captures provider response or transcript | No provider/message/session-history response hook for this flow; candidate enters only by explicit paste. |
| Overlarge provider response | Pi may display it; package makes no interception claim. Explicit pasted candidate is rejected if over bound. |
| Provider failure leaks through adapter errors | Package does not ingest provider errors/bodies; no package log or persistence. Pi/provider behavior is outside this adapter guarantee. |
| Assisted text is laundered through `user_authored` | No bridge to current writer; persistence remains unsupported until exact new authority is authorized. |
| Approval/editing upgrades authority | Every assisted-derived transient candidate remains `model_assisted_non_authoritative`. |
| Restart/reload/tree/fork/resume/new silently recovers eligibility | Invalidate; no recovery from entries, transcript, text similarity, or workspace bytes. Ordinary run-owned leaf advancement alone is not tree navigation; exact permitted lineage remains to be proved. |
| Source drifts during provider work or review | Revalidate before paste and every review/preview; discard local eligibility on mismatch. |
| Prior branch history/context contaminates source authority | Require a fresh reviewed ephemeral context profile; disclose that system/context material still accompanies the handoff and block pending/unrelated work. |
| Tools are restored while untrusted drafting context remains | Keep the dedicated session no-tool through copy-out and shutdown; do not continue ordinary tool-enabled work in it. |
| Second or concurrent attempt races the first | One generation token per session/application; new attempt explicitly cancels old or is rejected; late work cannot display as eligible or persist. |
| RPC client ignores or auto-submits handoff | Pi cannot authenticate the distinction; allow only separately reviewed conforming clients or keep RPC unavailable. |
| Cancellation, preflight failure, retry, cache warming, or queued work crosses attempt boundaries | Clear or conservatively invalidate; prove event ordering, outcome correlation, isolation lifetime, and no unrelated reuse. |
| Crash suggests recoverable draft | No package persistence or adoption; restart requires a new ephemeral session attempt. |
| Future save races source/state or collides | Separate authorization; exact preview, distinct approvals, lock-time revalidation, state-last, no-clobber, fail-closed settlement. |

## 5. Synthetic black-box SBDD acceptance map

These Given/When/Then rows are a future acceptance specification, not executable evidence or witnessed behavior.

| ID | Given | When | Then |
|---|---|---|---|
| 66-01 | Persistent Pi session with a valid attached application | User starts assisted drafting | Refuse before reading private source bodies into a handoff; explain `--no-session` and retention. |
| 66-02 | Ephemeral session, valid attachment, current job, effective original Resume | User starts drafting after activation reload | Build one bounded visible handoff labelled `original`; make no provider call. |
| 66-03 | Same with current tailored Resume | User starts drafting | Bind only tailored identity/text/digest and label it `tailored`; never fall back to original. |
| 66-04 | Missing job, effective Resume, activation, or valid attachment | User starts drafting | Refuse payload-free before editor/provider input. |
| 66-05 | Assistance is inactive | User activates it | Perform existing activation/reload only; create no cover-letter attempt or private snapshot. |
| 66-06 | Activation reload completed in a replacement runtime | User explicitly starts drafting | Read and validate sources in that runtime; do not depend on pre-reload variables. |
| 66-07 | A pending exact handoff exists in TUI under the reviewed handler/resource profile | User submits it normally | Reserved-envelope validation handles every failure; later-boundary evidence proves protected bytes/images unchanged before the run or drafting remains blocked. |
| 66-08 | A pending RPC editor handoff exists | RPC client returns editor content but sends no prompt | No provider work begins and no attempt becomes submitted. |
| 66-09 | Same, using a separately reviewed conforming client | Operator directs a separate ordinary prompt | Apply the same envelope/source checks as TUI; client conformance—not `InputEvent`—supplies the human-consent assumption. |
| 66-10 | An unreviewed RPC client ignores UI or auto-submits | Drafting is requested | Keep RPC drafting unavailable; do not claim Pi can detect indistinguishable automatic records. |
| 66-11 | User edits only bounded fact/instruction fields | Prompt is submitted | Accept exact allowed edits, freshly bind them, and preserve protected source sections. |
| 66-12 | User edits, removes, reorders, or duplicates protected source/label sections | Prompt is submitted | Handle/reject before provider processing; invalidate pending handoff. |
| 66-13 | Input includes images, extension-originated submission, malformed envelope, or validation throws | Input arrives | Catch and return handled with payload-free guidance; no assisted run or eligibility. |
| 66-14 | Job/Resume contains instructions to browse, call tools, reveal secrets, or override policy | Draft prompt is submitted | Source remains quoted untrusted data; the dedicated session exposes no declared or callable tool through copy-out/shutdown. |
| 66-15 | Any declared, nested-callable, `codemode`, `deferred`, Career, or open-world tool would remain reachable | Submission is attempted | Block the assisted action before provider input. |
| 66-16 | Unknown or contradictory employer/date/metric/skill/motivation fact | Model drafts | Prompt requests omission or a marked question; later review never treats inferred text as verified. |
| 66-17 | Facts, instruction, source, or total handoff exceeds an approved bound | Handoff is prepared/submitted | Reject without truncation, provider call, or persistence. |
| 66-18 | Source/attachment changes before `input` | User submits old handoff | Reject and invalidate; never rebind old text. |
| 66-19 | Source changes after submission but before paste | User opens local review | Reject paste eligibility and require a new attempt. |
| 66-20 | Source changes after paste but before claims preview | Preview opens | Discard candidate and fail closed. |
| 66-21 | Source changes after a future persistence preview | Save is attempted under lock | Future writer rejects; no artifact/state commit or overwrite. |
| 66-22 | Pi displays a valid provider response | User does nothing | Package captures and stores nothing; no local draft becomes eligible merely from displayed content. |
| 66-23 | Pi displays an overlarge or malformed response | User does nothing | Package makes no interception claim and stores nothing. |
| 66-24 | Provider refuses, times out, rate-limits, errors, retries, recovers, compacts, or cache-warms | Pi processes the lifecycle | Package adds no raw body/error log or reconstructed draft; the attempt is ineligible unless the exact approved metadata-only completion sequence is proved. |
| 66-25 | Observed-started attempt has positively correlated completion/final settlement, unchanged sources/generation, and no unrelated lineage | User explicitly pastes one bounded candidate | Accept one transient `model_assisted_non_authoritative` candidate; do not prove provider provenance. |
| 66-26 | Pasted candidate exceeds byte/scalar bounds or has invalid encoding/control content | Review starts | Reject without truncation or persistence. |
| 66-27 | No submitted attempt, or attempt was invalidated | User pastes an old draft | Reject; text similarity, labels, and user assertion cannot recreate eligibility. |
| 66-28 | Candidate contains an unsupported metric/employer/date/claim | Claims review opens | Present it for retain/revise/remove/question judgment without truth certification. |
| 66-29 | User revises or approves candidate | Review completes | Keep `model_assisted_non_authoritative`; never promote to `user_authored`. |
| 66-30 | User requests Career Core prose/truth certification | Review continues | Refuse the claim and make no Core prose-review call. |
| 66-31 | Package-owned assisted candidate/attempt is still known in process | User requests the current `user_authored` action through a package-owned route | Do not bridge, prefill, or automatically invoke that writer; explain the authority mismatch. Do not claim detection of arbitrary external paste after copy-out/restart. |
| 66-32 | User declines review or copy-out | Flow ends | Clear candidate/attempt; create no artifact, state, custom entry, backup, or sidecar. |
| 66-33 | User cancels at handoff, submission preparation, paste, claims review, or preview | Cancellation occurs | Clear relevant transient state; no automatic retry or save. |
| 66-34 | Accepted input fails preflight without `agent_start`, or an observed run aborts/errors | Available lifecycle/timeout boundary occurs | Conservatively invalidate; do not assume a never-started run emits settlement or that `agent_settled` proves success. |
| 66-35 | Actual tree navigation, reload, new, resume, fork, shutdown, or process restart occurs | Lifecycle event fires | Clear pending/submitted attempt and candidate; ordinary owned descendant appends follow the separately proved lineage rule, and no recovery occurs from transcript/workspace. |
| 66-36 | Two attempts target the same application/session | Second begins | Apply exact one-generation policy; no stale candidate can become eligible. |
| 66-37 | Labels collide across applications | Handoff/paste is validated | Attachment/application/source identity controls authority; labels never select the application. |
| 66-38 | User asks to research a company or submit to an employer | Drafting action is used | Refuse; no web fetch, provider client, employer submission, or external tool action. |
| 66-39 | Private synthetic sentinels exist in source/facts/candidate | Package-controlled logs/errors/config/workspace are inspected | Sentinels are absent; only the operator-approved ephemeral Pi/provider handoff contains selected context. |
| 66-40 | Crash occurs after response or paste | Process restarts | No package draft recovery/adoption; approved workspace bytes remain unchanged. |
| 66-41 | Future assisted persistence is separately authorized | Exact file preview is returned changed | Reject and require a fresh preview; no authority change or write. |
| 66-42 | Same | Exact preview is unchanged but artifact approval is declined | Write nothing. |
| 66-43 | Same | Artifact approval succeeds but distinct workspace mutation approval is declined | Write nothing; approvals are not interchangeable. |
| 66-44 | Same | Collision, capacity, lock, state drift, or crash occurs | Preserve immutable history, no-clobber, state-last, and existing settlement classifications. |
| 66-45 | Older pi-career reader encounters future assisted authority under canonical state ID | It reads the state | Fail closed; do not reinterpret as user-authored, migrate, rewrite, or prefix-match. |
| 66-46 | TUI and separately reviewed conforming RPC client execute equivalent synthetic scenarios | Results are compared | Enforceable eligibility, bounds, invalidation, and authority outcomes match; RPC human mediation remains a client trust assumption and unsupported clients remain unavailable. |
| 66-47 | Draft completes in a dedicated no-tool ephemeral session | Candidate review/copy-out finishes | Keep tools unavailable and require session shutdown; later tool-enabled continuation in that contaminated context is unsupported. |
| 66-48 | Prior application prompts, pending messages, or earlier attempt exist in the session | Drafting starts | Refuse and require a fresh reviewed ephemeral session; handoff bounds are never described as complete request bounds. |

## 6. Bounded later implementation and verification plan

### Phase A — owner decisions and executable Pi probes (no product implementation)

The first executable probe pass is complete and recorded in [issue-66-pi-1.0.4-probe-report.md](issue-66-pi-1.0.4-probe-report.md). It failed the final-prompt and metadata-only correlation feasibility gates, so Phase B remains blocked. The remaining owner decisions below are not implementation authorization.

1. Approve the exact bounds table described in §3.4.
2. Decide whether requiring `--no-session` is acceptable product behavior. If persistent sessions must be supported, first authorize a different retention contract; “no prompt/response persistence” cannot be claimed.
3. Approve the exact structured handoff grammar and which fact/instruction edits are allowed.
4. Approve a dedicated-session no-tool isolation design. Probe Pi 1.0.4 for declared versus callable reachability, the existing Career input-refresh conflict, all loadout writers, queue/cancellation/retry/cache-warming behavior, and a no-restoration-through-shutdown lifetime.
5. Prove a fail-closed final prompt boundary after handler composition/expansion. If supported APIs cannot prove protected bytes/images unchanged, stop.
6. Define a pre-submit branch anchor and exact permitted run-owned descendant lineage; distinguish ordinary appends from navigation and unrelated work.
7. Probe TUI and RPC separately for handoff presentation and ordinary submission. Define reviewed RPC-client conformance as an external trust prerequisite or keep RPC blocked.
8. Define exact metadata-only events for accepted-but-not-started, observed start, completion outcome, abort/failure, final settlement, and deterministic cleanup. If positive eligibility cannot be correlated without response content, stop.
9. Decide whether issue #66's first implementation ends at transient review/copy-out or separately authorizes future assisted persistence.

### Phase B — transient implementation, only after separate approval

1. Add a small in-memory state machine: `idle -> pending_handoff -> validated_input_not_started -> observed_started -> completed -> finally_settled -> pasted_candidate -> reviewed`, with conservative invalidation from every state.
2. Add the post-reload explicit drafting action and exact source/handoff validator. Do not change activation entries or persist private drafting state.
3. Enforce a fresh ephemeral-session context profile and the approved dedicated no-tool isolation lifetime through copy-out/shutdown.
4. Validate the reserved ordinary prompt fail-closed at `input` and at the approved final boundary; do not automatically submit it.
5. Add exact branch-lineage/generation and metadata-only run-outcome correlation established in Phase A.
6. Add explicit bounded paste and advisory claims review. Do not inspect provider/message/session output.
7. Preserve existing reader/writer, runtime resolver, Core, privacy, and packaging contracts. Any separately authorized authoritative TypeScript implementation must add synthetic tests and reproducible tracked `dist` updates required by `npm run check:dist`; this specification phase changes neither.

### Phase C — optional persistence, separately authorized again

1. Specify exact new authority parsing and old-reader fail-closed behavior under `pi.career.application_state`.
2. Implement immutable artifact/state transaction with exact unchanged preview, distinct artifact/workspace approvals, lock-time source revalidation, no-clobber publication, and state commit last.
3. Prove no user action or approval upgrades assisted authority.

### Verification

Before any implementation review:

- turn every applicable §5 row into synthetic black-box SBDD evidence;
- add focused lifecycle probes for activation reload, later reload, restart, ordinary leaf advancement versus branch navigation, input-handler errors/transforms, expansion, preflight-no-start, abort, retry/recovery/compaction/cache warming, queued input, completion outcome, and settlement;
- test declared and callable tool reachability, existing Career refresh conflicts, dedicated-session no-restoration behavior, TUI, and reviewed conforming RPC clients independently; keep unsupported RPC unavailable rather than claiming automatic-client detection;
- use synthetic resumes, job descriptions, facts, provider events, and sentinel errors only;
- distinguish scenario specifications, unit/integration evidence, host-Pi evidence, and provider-wire evidence;
- obtain independent technical/security review of privacy, tool isolation, lifecycle binding, authority, old-reader behavior, and transaction safety; and
- run the complete governing verification ladder from `AGENTS.md`, reporting exact results and objective skips.

## 7. Unresolved authorization decisions

The following decisions block production implementation:

1. Is an ephemeral Pi session mandatory, as required by the current no-persistence boundary, or may ordinary Pi prompt/response persistence be authorized with revised consent and retention language?
2. What are the exact context, fact, instruction, handoff, candidate, and claims bounds?
3. What exact editable handoff grammar is approved?
4. Can Pi 1.0.4 provide a reviewed, race-safe dedicated no-tool session through copy-out/shutdown, including callable tools, Career refresh, retries, cache warming, and queued/deferred work?
5. Can supported APIs prove a fail-closed final prompt boundary after all input handlers and expansion, or must drafting remain blocked?
6. What branch anchor/lineage permits only the owned run's normal appends while rejecting navigation and unrelated work?
7. Which metadata-only lifecycle events establish accepted-but-not-started, observed start, positive completion, failure/abort, final settlement, and deterministic cleanup without observing assistant content?
8. What reviewed RPC-client behavior is trusted, and is unavailable RPC drafting acceptable for all other clients?
9. Is a fresh ephemeral context plus no tool restoration and required shutdown after copy-out acceptable product behavior?
10. Does the first separately approved implementation stop at transient review/copy-out?
11. If persistence is later desired, does the owner explicitly authorize the new `model_assisted_non_authoritative` parser/writer and expected older-reader failure under the unchanged canonical state identifier?
12. What retention statements are required for provider retry/cache behavior, Pi in-memory context/cache warming, TUI/terminal, RPC client, editor/clipboard, exports, and OS surfaces?

Until these decisions and independent review are complete, issue #66 remains a documentation/threat-model proposal only. No production provider/model behavior, automatic submission, assisted persistence, implementation, release, or publication is authorized.
