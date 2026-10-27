# Issue #66 — Pi 1.0.4 boundary probe report

**Status: executable research evidence; production drafting remains blocked.** This report records synthetic, no-provider probes against the exact lockfile-resolved `@earendil-works/pi-coding-agent@1.0.4`. It adds no product command, source/runtime behavior, provider call, response capture, persistence, or authority change. It is not an implementation approval.

## Decision

The public Pi 1.0.4 extension contract cannot currently prove the fail-closed final-prompt, arbitrary co-extension isolation, run-correlation, and RPC human-mediation properties required by the [issue #66 proposal](issue-66-assisted-cover-letter-proposal.md). Therefore Phase B must not start on this contract.

One narrower fact is positive: a controlled host created with Pi's all-tools denylist can have no registered, active, or nested-callable tools. That is useful configuration evidence, but it is not sufficient isolation. Loaded extensions still share process authority, request hooks compose in load order, and Pi exposes no exclusive tool/request lease.

## Scope and method

The probes use only synthetic strings, in-memory sessions, an unreachable loopback model configuration, and a disposable RPC process. The RPC input is handled before provider execution. No provider endpoint is contacted and no private document is read.

Evidence is split deliberately:

- `tests/audit/issue-66-pi-boundary-probe.test.mjs` exercises Pi's exported `ExtensionRunner`, `AgentSession`, `SessionManager`, and tool-exposure behavior.
- `tests/workflow/issue-66-rpc-boundary-probe.test.mjs` starts the pinned Pi RPC host with `--offline --no-session --no-tools` and a synthetic fixture extension.
- `tests/fixtures/issue-66-rpc-probe-extension.mjs` is probe-only and is not packaged.

These tests establish host/API behavior only. They do not establish provider-wire secrecy, model truthfulness, secure erasure, arbitrary-client human intent, or safety against an unreviewed extension with the same process privileges.

## Results

| Probe | Executed observation | Consequence for issue #66 |
| --- | --- | --- |
| P66-01 input composition | A first `input` handler accepted exact protected text; a later handler transformed it. | An early package validator is not a final prompt-integrity boundary. |
| P66-02 input exception | A throwing `input` handler produced an extension error, then a later handler ran and transformed the input. | Throwing is fail-open for this purpose. A validator must return `handled` for its own detected failure, but that cannot protect accepted text from later handlers. |
| P66-03 provider-request composition | A later `before_provider_request` handler replaced a payload observed by an earlier guard. | The request hook is not exclusive or final relative to later loaded handlers. |
| P66-04 request-hook exception | A throwing request guard produced an extension error and a later request handler still ran. | `before_provider_request` is not a fail-closed cancellation primitive. |
| P66-05 active versus callable tools | With no active declarations, registered `codemode` and `deferred` tools remained callable. Calling `setActiveTools([])` did not remove them. | Empty `getActiveTools()` is not no-tool isolation. |
| P66-06 all-tools denylist | In a controlled SDK host using `noTools: "all"`, synthetic direct/deferred custom tools were absent from registered, active, and callable sets. | A locked startup profile can remove Pi tool reachability, but only for the controlled resource set; it does not sandbox extension code or grant exclusive ownership. |
| P66-07 leaf progression | User, custom metadata, and assistant appends each advanced the in-memory session leaf through a parent chain without tree navigation. | Leaf change cannot identify navigation or ownership. A lineage policy needs event/run correlation, not a frozen leaf ID. |
| P66-08 RPC `setEditorText` | RPC emitted fire-and-forget `set_editor_text`; no blocking response was required. | It cannot prove that a client displayed or preserved the handoff. |
| P66-09 RPC `editor()` | RPC emitted a blocking `editor` request and accepted an echoed response without submitting it as an ordinary prompt. | The editor dialog can expose/review bytes, but returning it is not provider consent. |
| P66-10 later RPC prompt | The automated probe client sent the later prompt; `InputEvent.source` was exactly `rpc`, the same value available to a human-controlled client. | Pi exposes no authenticated human-action marker. Unsupported RPC clients must remain blocked. |

## Boundary analysis

### Final prompt and provider-request boundary — blocked

The observed pipeline permits changes after an issue #66 validator:

1. `input` handlers compose in load order and may transform accepted text.
2. Skill/template expansion and image normalization occur later.
3. `before_agent_start` observes expanded text but has no general cancellation result.
4. Context handlers can alter the request transcript.
5. `before_provider_request` handlers can replace the complete payload, but exceptions are reported and processing continues; later handlers may replace an earlier handler's result.

A package could support only an exact, reviewed handler/resource profile and attempt to be last, but the public contract does not reserve last position, freeze later registration, or provide a fail-closed cancellable final hook. Returning a malformed/replacement payload is not an approved cancellation mechanism and may still initiate provider behavior. The required property is therefore unproved.

### Tool isolation — partially evidenced, still blocked

The all-tools denylist is stronger than `setActiveTools([])`: in the controlled probe it removed registered and callable synthetic tools. A future design could require a fresh process started with the equivalent all-tools policy and an exact reviewed extension set.

That does not complete the threat model:

- extensions execute with shared process permissions and can perform work without registering a model tool;
- no issue #66 extension API acquires an exclusive, immutable loadout lease;
- handler/resource registration and other loaded extensions remain trust inputs;
- the public API does not attest queue emptiness, disable cache warming/retry globally for one attempt, or prove no later actor changes request handling; and
- restoring tools in the contaminated session remains unsafe.

The only acceptable direction remains a dedicated fresh ephemeral process, all-tools denylisted from startup through mandatory shutdown, with an exact reviewed resource profile. Even that remains blocked by final-prompt and lifecycle correlation.

### Lifecycle and lineage — insufficient contract

Pi exposes useful pieces, but not one authoritative run identity:

- accepted input has no extension-visible preflight outcome when model/authentication checks fail before `agent_start`;
- `agent_start` and `agent_settled` carry no run/generation identifier;
- `agent_before_settle` carries `completed|aborted|error`, while `agent_settled` carries no outcome;
- queueing, retry, compaction/recovery, and boundary continuation can create multiple low-level turns inside one run; and
- ordinary message/custom-entry appends advance the leaf without navigation.

A package-local single-attempt token can conservatively invalidate, but cannot prove that all observed scalar events and descendants belong to the accepted protected input in every preflight, retry, queue, abort, and reload path. Positive paste eligibility therefore remains unproved.

### TUI and RPC — RPC remains unavailable

TUI can place text in the native editor, but prompt integrity still fails at later shared handlers. RPC `editor()` provides a real request/response boundary and does not auto-submit in Pi itself. Nevertheless, the executed client was fully automatic and produced the same later `source: "rpc"` input that a human-controlled client would produce. Human mediation is an external client-conformance assumption, not extension evidence.

No general RPC drafting support should be implemented. A future separately reviewed RPC client could be named explicitly, but that would not resolve final-prompt or lifecycle blockers.

## Phase A disposition

| Phase A item | Disposition |
| --- | --- |
| Exact bounds table | Owner decision still required; no implementation defaults were inferred. |
| Ephemeral-session requirement | Retain as mandatory for the proposed no-session-file boundary. |
| Structured handoff grammar | Still requires approval; grammar alone cannot solve later mutation. |
| Dedicated no-tool design | All-tools denylist is promising in a controlled host; exclusive lifetime/isolation remains unproved. |
| Fail-closed final prompt boundary | **Failed. Blocking.** |
| Branch anchor and owned lineage | Parent-chain evidence exists; authoritative run ownership remains unproved. |
| TUI/RPC | TUI is not sufficient yet; generic RPC is blocked because human action is unauthenticated. |
| Metadata-only lifecycle correlation | **Insufficient. Blocking.** |
| First implementation endpoint | If blockers are ever resolved, retain transient review/copy-out only; persistence needs another authorization. |

## Required upstream or host-contract capabilities

At least the following would be needed before reconsidering Phase B:

1. A fail-closed cancellable hook over the final provider-bound prompt/images after all transforms, with explicit ordering or exclusive ownership.
2. An immutable per-run identifier propagated through accepted preflight, start, outcome, retries/continuations, and final settlement—including a never-started failure result.
3. A host-enforced no-tool/no-nested-tool lease that exposes the effective registered/declared/callable sets, rejects later reachability changes, and lasts through mandatory shutdown.
4. A queue/context generation contract that distinguishes owned descendant appends from unrelated input, navigation, retry, and recovery.
5. For RPC, a separately trusted client protocol with an authenticated user gesture—or an explicit product decision to keep drafting unavailable in RPC.

Until such a contract is available and independently reviewed, the safe next action is to keep issue #66 at specification/research status rather than implement a weaker approximation.
