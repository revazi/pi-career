# Application-owned cover letters — issue #57

This contract authorizes only user-authored Markdown or UTF-8 plain-text cover-letter artifacts in the application workspace. It does not authorize provider/model drafting, adoption of files, submission, or deletion.

## Authority and state

The canonical `pi.career.application_state` schema retains its nullable `cover_letter_artifact` reference. A non-null reference binds a private application-owned relative path, SHA-256, UTF-8 byte size, format, `authority: "user_authored"`, current vacancy digest, and effective-resume digest. Readiness remains derived from the complete validated state chain and current dependencies; a missing, stale, drifted, or unavailable reference is not ready.

Artifacts are immutable revisions named `cover-letter-NNNNNN.md` or `.txt`; edits create a new artifact and state revision and never modify prior artifact bytes. View opens the validated current artifact in local UI only. Clear appends a state revision with a null reference and does not remove artifact history.

## Write transaction

1. Require the currently attached, valid application and both a current vacancy and effective resume. Ask the user to select Markdown or plain text, then author content in a local editor. Input must be valid UTF-8, non-empty, CR-free, NUL-free, and no larger than the existing 262,144-byte workspace text bound.
2. Display the exact authored bytes in a separate preview editor. Require unchanged return, then require a distinct persistence confirmation. Cancellation at either step writes nothing.
3. Build a path-free mutation preview and obtain the existing explicit workspace mutation approval. Under the application-root lock, revalidate config snapshot, attached application identity, current application parent hash (which binds the expected previous cover-letter reference), vacancy/resume authority, capacity, and absence of every target.
4. Publish artifact then state using the existing private temporary-file, exclusive/no-clobber publication protocol; state is the commit record. On failure, rollback only files proven to be owned by this transaction. Unknown pre-existing files fail closed and are never overwritten/adopted. A state append is never reported successful unless its committed head is verified.

All data remains local to the configured application workspace and local Pi UI. No Core/provider/network calls or session payload appends occur. Errors remain payload-free. Clearing and editing preserve the complete immutable artifact history.
