# Single application-state contract — issue #140

## Status and scope

This contract replaces application-state schema versioning with one exact pi-career-owned schema:

```text
pi.career.application_state
```

Issue #140 approves this contract only. Issue #141 owns production, fixture, generated-bundle, and documentation convergence. Until #141 is merged, source and historical acceptance evidence may still describe the superseded `.v1`/`.v2` implementation.

There is no application-state schema migration or compatibility path. Files whose `schema_version` is `pi.career.application_state.v1`, `pi.career.application_state.v2`, or any other value are unsupported and fail closed. They are never rewritten, adopted, interpreted as a compatible prefix, or exposed as current state.

Append-only numbered revisions are retained. Revision numbers and parent hashes protect immutable history, concurrency, crash settlement, and no-clobber publication; they are not schema versions.

## Canonical schema

Every state revision is canonical two-space JSON plus one LF with these exact ordered keys:

```json
{
  "schema_version": "pi.career.application_state",
  "kind": "application_state_revision",
  "application_id": "00000000-0000-4000-8000-000000000001",
  "sequence": 1,
  "parent_sha256": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "status": "preparing",
  "vacancy": null,
  "selected_original": null,
  "resume_artifact": null,
  "cover_letter_artifact": null,
  "updated_at": "2026-08-12T00:00:01.000Z"
}
```

The field meanings and bounds remain:

- `application_id`: canonical lowercase application UUID bound to the immutable manifest.
- `sequence`: integer 1 through 64 matching the six-digit state filename.
- `parent_sha256`: SHA-256 of the exact manifest bytes for sequence 1, otherwise of the immediately preceding exact state bytes.
- `status`: `preparing`, `applied`, `interviewing`, or `closed`.
- `vacancy`: `null` or the existing exact ordered vacancy reference.
- `selected_original`: `null` or the existing exact ordered original Resume binding.
- `resume_artifact`: `null` or the existing exact ordered assisted artifact and sidecar reference.
- `cover_letter_artifact`: `null` or the exact ordered reference below.
- `updated_at`: canonical UTC timestamp with milliseconds, strictly increasing across revisions.

A non-null cover-letter reference has exactly these ordered keys:

```json
{
  "relative_path": "cover-letter.md",
  "artifact_sha256": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "utf8_bytes": 42,
  "format": "markdown",
  "authority": "user_authored",
  "job_description_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "effective_resume_sha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
}
```

Retaining this nullable shape does not authorize a cover-letter writer, rebind, publication, deletion, or adoption flow. Those remain separately gated by #57. A future approved writer must use this shape rather than introduce another application-state schema.

## Complete-chain rules

A trusted chain contains only `pi.career.application_state` revisions and must satisfy all existing safety rules:

1. State files begin at `.pi-career-state-000001.json`, are contiguous, match embedded sequence values, and never exceed 64 revisions.
2. Sequence 1 hashes the immutable manifest; each later revision hashes the exact previous revision.
3. Every revision binds the same application UUID and has a strictly later canonical timestamp.
4. Every referenced package-owned file retains exact containment, ownership, mode, link-count, size, and hash validation.
5. Gaps, forks, duplicate state-shaped names, malformed bytes, unsupported schema identifiers, historical managed-reference drift, races, and exceeded bounds reject the complete chain. No last-known-good prefix becomes current.
6. Reads never mutate, migrate, repair, compact, adopt, or delete state.

New applications and every approved state mutation write only the one canonical schema. There is no transition revision, upgrade, downgrade, dual reader, or mixed-schema chain.

## Readiness and authority

The existing pure readiness and effective-Resume rules operate on a fully validated single-schema head. Readiness remains derived rather than persisted or manually toggled. Lifecycle status and match results do not override component validity.

This simplification changes no authority or consent boundary:

- original Resumes remain immutable and external to application workspaces;
- workspace files remain authoritative for attached application state;
- Career Core remains authoritative for supported career-domain operations and contracts;
- no read, migration rejection, or readiness derivation invokes Core, a provider/model, network, telemetry, or session append;
- every mutation still requires exact preview, unchanged return, separate confirmation, fresh under-lock validation, no-clobber publication, state commit last, and payload-free errors;
- no private body, path, UUID, hash, environment value, raw error, Core result, prompt, or provider content is logged or exposed at the adapter boundary.

## Acceptance scenarios for #141

| ID | Given | When | Then |
|---|---|---|---|
| S1-01 | Canonical single-schema sequence 1 | Read application | Accept exact state without mutation |
| S1-02 | Multiple contiguous single-schema revisions | Read application | Select the exact highest complete head |
| S1-03 | A former `.v1` or `.v2` identifier anywhere in the chain | Discover or read | Classify unsupported; trust no prefix and mutate nothing |
| S1-04 | Any other unsupported canonical schema identifier | Discover or read | Classify unsupported with a payload-free result |
| S1-05 | Gap, fork, duplicate name, bad parent, or malformed state | Discover or read | Fail closed under the existing drift classification |
| S1-06 | New application | Commit approved creation | Write sequence 1 using only `pi.career.application_state` |
| S1-07 | Approved status, vacancy, or selected-original mutation | Commit | Append one canonical single-schema revision |
| S1-08 | Nullable or valid non-null cover-letter reference | Parse and derive | Preserve the exact shape and existing readiness rules without authorizing a writer |
| S1-09 | Concurrent same-next-revision plans | Commit | One no-clobber winner; no fork, retry name, or overwrite |
| S1-10 | Capacity, byte, metadata, or post-preview race boundary | Plan or commit | Preserve existing before-preview and under-lock rejection |
| S1-11 | Unsupported former-schema application | Open overlay or restore attachment | Do not expose as valid/current, attach, migrate, or append |
| S1-12 | Any read or rejected mutation above | Observe side effects | No Core/provider/network/session/logging or unauthorized file effect |

## Explicit exclusions

This contract does not authorize cover-letter persistence, deletion, archive, synchronization, repair, unknown-file adoption, provider behavior, a package-version change, publication, or release. It does not change config, marker, identity, attachment, activation, variant-sidecar, Career Core, or managed-tool schema identifiers.
