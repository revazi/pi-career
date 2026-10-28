# Application-owned cover letters — issues #57 and #166

This contract authorizes two distinct Markdown or UTF-8 plain-text cover-letter authorities in the application workspace:

- independently entered content with `authority: "user_authored"`; and
- explicitly pasted model output with permanent `authority: "model_assisted_non_authoritative"` and `schema_version: "pi.career.assisted_cover_letter_reference.v1"`.

The assisted workflow uses the ordinary Pi trust model. Loaded extensions and prompt handlers remain trusted inputs; pi-career does not claim exclusive sandboxing, authenticated human intent, or final-provider-prompt integrity. TUI and RPC may expose the same local actions, but a generic RPC client is itself a trusted external boundary: Pi supplies no authenticated human-action marker, and pi-career does not represent RPC activity as proof of manual review. The stronger issue #66 design remains blocked as recorded in [issue-66-assisted-cover-letter-proposal.md](issue-66-assisted-cover-letter-proposal.md) and [issue-66-pi-1.0.4-probe-report.md](issue-66-pi-1.0.4-probe-report.md).

## Authority and state

The canonical `pi.career.application_state` schema retains its nullable `cover_letter_artifact` reference. Both reference variants bind a private application-owned relative path, SHA-256, UTF-8 byte size, format, current vacancy digest, and effective-resume digest. The assisted variant additionally carries its exact reference schema and non-authoritative authority. Editing, previewing, approving, importing, viewing, carrying, or clearing assisted content never upgrades it to `user_authored`.

User-authored artifacts are immutable revisions named `cover-letter-NNNNNN.md` or `.txt`. Assisted artifacts are separately named `cover-letter-assisted-NNNNNN.md` or `.txt`, where the suffix is the introducing state sequence. Every edit/import creates a new artifact and state revision and never modifies prior bytes. View opens the validated current artifact in local UI and identifies its authority. Clear appends a state revision with a null reference and retains artifact history.

Readiness remains derived from the complete validated state chain and current dependencies. Either authority may be `Available`, but a missing, stale, drifted, or unavailable reference is not ready. Readiness does not promote authority.

## Visible drafting handoff

1. Require a currently attached valid application, current vacancy, and exact current effective Resume.
2. Build a bounded prompt containing those sources as visibly delimited untrusted JSON data. The prompt forbids invented facts, tool/file use, automatic submission, and claims of persistence.
3. Place the prompt in Pi's native editor. pi-career does not submit it, append it as a session entry, call a provider, capture a response, or infer completion.
4. The operator reviews and submits through ordinary Pi interaction. Any generated response remains ordinary Pi output until the operator separately chooses import and pastes exact text.

## User-authored write transaction

1. Require the attached application and current vacancy/effective Resume. Select Markdown or plain text, then enter content in a local editor. Input must be valid UTF-8, non-empty, CR-free, NUL-free, and no larger than 262,144 bytes.
2. Display exact bytes in a separate preview editor. Require unchanged return and distinct persistence confirmation. Cancellation writes nothing.
3. Build the existing path-free workspace mutation preview and obtain explicit mutation approval.
4. Under the application-root lock, revalidate config, attachment, parent state, dependencies, capacity, and target absence. Publish artifact then state through private temporary files and exclusive no-clobber publication; state is the commit record.

## Assisted import transaction

1. Import is a separate explicit action; pi-career never sources content from provider events or chat history. Select Markdown or plain text and paste the proposed draft into a local editor under the same UTF-8/control/262,144-byte bounds.
2. Display exact pasted bytes in a separate preview. Require unchanged return and a distinct confirmation that the content will remain model-assisted and non-authoritative.
3. Build the path-free mutation preview and obtain the existing workspace mutation approval. Under lock, revalidate the exact config, attached application identity, parent state, vacancy, effective Resume, selected-original/library authority, capacity, and absence of every target.
4. Publish `cover-letter-assisted-NNNNNN.*` and its state reference through the existing immutable no-clobber transaction. Failures roll back only transaction-owned files; unknown or colliding files are never overwritten or adopted.

All persistence remains local to the configured application workspace. No Career Core call, provider call, response capture, telemetry, automatic application submission, or hidden file write occurs. Errors remain bounded and payload-free.
