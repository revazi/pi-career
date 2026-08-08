# Application workspace design

## Problem

A single active vacancy on a Pi session branch is not enough to organize a real job search. Users need an explicit boundary for each company/role combination so resume changes, cover letters, notes, and status do not leak into another application. Application artifacts must also stay out of original-resume indexing.

This document defines the target workspace contract. The current package does not create these private files yet; that requires a separately reviewed, explicit persistence workflow.

## Directory model

Resume originals and application work must be separate roots:

```text
career-home/
  originals/
    master-resume.pdf
    engineering-resume.md
  applications/
    synthetic-company-senior-engineer-a1b2c3d4/
      application.json
      vacancy.md
      changes.md
      resume.md
      resume.pi-career.json
      cover-letter.md
      notes.md
```

Keep one flat directory per application. Do not add company-level or artifact-type subdirectories. Optional preparation files such as `interview.md` can sit beside the standard files.

The application workspace must not be nested inside a directory scanned as an original-resume root unless the scanner has an exact configured exclusion for it. Broad name-based exclusions such as ignoring every `applications/` directory are not acceptable.

## Identity and collisions

One application represents one company/role attempt and receives an immutable random application ID. Its directory name is a display convenience, not authority:

```text
<bounded-company-slug>-<bounded-role-slug>-<application-id-prefix>/
```

Two roles at one company and repeated applications to one role therefore remain distinct. Renaming a display label does not change application identity.

A future exact manifest schema should contain only bounded metadata and digests, for example:

- schema version
- application ID
- bounded company label
- bounded role label
- status
- created/updated timestamps
- selected original resume ID and text digest
- vacancy text digest
- assisted artifact relative paths and digests

It must not contain absolute paths, provider credentials, provider responses, or unreviewed raw model output.

## Original and styling boundary

Original resumes are immutable:

- Never overwrite, rename, move, or reformat an original automatically.
- A PDF workbench has extracted text only. It cannot inspect or preserve typography, columns, spacing, graphics, or other visual layout.
- PDF changes are stored as a reviewed change plan and bounded before/after snippets for manual application in the styled source.
- Markdown/text variants may preserve existing structure by applying only user-selected, Career Core-reviewed exact changes to a new file.
- DOCX/Pages/other styled-source mutation remains unsupported until format-specific fidelity and safety are designed and tested.
- Every generated resume file is assisted/non-authoritative, has a valid sidecar, and is excluded from authoritative readiness analysis and job matching.

Copying the original into every application is not the default. The application manifest references the configured original by package ID and digest. A user may separately choose to place their own editable source in the application folder.

## Artifact roles

| Artifact | Purpose | Authority |
|---|---|---|
| `application.json` | Bounded application identity/status/digests | Local workflow state only |
| `vacancy.md` | User-approved local copy of the vacancy | Original user input, not normalized rewrite |
| `changes.md` | Reviewed targeted changes and verification checklist | Assisted/non-authoritative |
| `resume.md` plus sidecar | New user-selected assisted variant | Assisted/non-authoritative; never reranked |
| `cover-letter.md` | Application-specific draft | Assisted/non-authoritative |
| `notes.md` | User-owned preparation notes | Not Career Core input unless explicitly selected later |

No raw provider response should be written automatically. A bounded artifact is saved only after the user reviews and approves its exact destination and content.

## Session and privacy model

Use one Pi session per application. Start `/new` before `/career-application` for another company/role so earlier private prompts and provider responses do not remain in the next application conversation.

Each active application binds:

- application ID and labels
- current vacancy
- selected original resume
- deterministic analysis/match cards
- prepared workbench conversation
- reviewed suggestions/replacements
- assisted artifact references
- application status

A persisted Pi session can still contain private prompts and tool arguments. Application-file approval is separate from Pi session persistence and separate from provider disclosure. The workflow must ask before the first private workspace write and show the exact workspace path and files to be created.

A transient `pi --no-session` run prevents Pi session JSONL persistence but does not imply temporary application files or secure erasure. Workspace creation must remain an explicit independent action.

## Proposed workflow

1. `/career-setup` configures original-resume roots and a separate application workspace root.
2. In a fresh Pi session, `/career-application` creates one consented company/role context; it does not write files or switch that session to another company.
3. `/career-vacancy` binds the vacancy to that application.
4. `/career-match` ranks eligible originals and records the selected original reference.
5. `/career-workbench` prepares a visible guided editor prompt that reruns complete deterministic baselines after submission; its rewrite interview can ask one bounded batch of factual questions and wait for a later answer.
6. External suggestions, replacements, or vacancy-specific variant changes use exact verbatim source targets and are reviewed once by exact Career Core schemas; discarded proposals are reported rather than automatically repaired or retried.
7. For a non-PDF variant, the first assisted turn stops so the user can explicitly select canonical retained change IDs; only a later turn materializes those exact selections.
8. A future save action separately requests local-file approval, previews exact new files, and writes only inside the selected application directory.
9. Originals remain unchanged, and assisted variants remain excluded from authoritative reranking.

## Implementation phases

### Phase A: current PR

- searchable PDF indexing and actionable notices
- visible, bounded workbench editor handoff
- immutable-original and format-fidelity instructions
- branch-aware application metadata in consented custom session entries
- company/role/status selection and vacancy/result binding to application ID
- flat application workspace contract with no private application-file writes

### Phase B: workspace configuration

- separate configured original-resume and application workspace roots
- exact application-root exclusion from resume scanning
- preview-only directory/file plan with no writes

### Phase C: explicit workspace persistence

Requires separate review of:

- config schema migration for an application workspace root
- canonical containment and symlink/race protections
- exact manifest and sidecar schemas
- atomic bounded writes and file modes
- collision behavior and idempotency
- file preview/approval UI
- application-root scan exclusion
- retention, removal, and uninstall semantics
- package tests using synthetic artifacts only
