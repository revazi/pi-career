# Agent-context benchmarks

Token usage is a product constraint for an agent tool, not an incidental implementation detail. This directory therefore keeps historical migration evidence and a separate three-state optimization benchmark using only synthetic content.

## Historical managed-adapter evidence

[`baselines/career-run-v1.json`](baselines/career-run-v1.json) preserves the design-review comparison that motivated `career_run`: the prior raw-tool surface and review envelope versus the first compact managed adapter. It is historical evidence and is not rewritten when the current tool evolves.

## Token-optimization phase v1

[`phases/token-optimization-v1.json`](phases/token-optimization-v1.json) is the state machine for the current optimization study. It deliberately separates measurement from optimization:

1. **`before_frozen` (current phase):** [`baselines/token-optimization-v1-before.json`](baselines/token-optimization-v1-before.json) is byte-hash-pinned to the post-save-workflow production source and Agent Skill at `c7d76344ccdfd8a370c8c69467d2022d9aea5d2e`. Its exact `src/` and `skills/` Git tree IDs are part of the snapshot and phase manifest. No token optimization belongs in the baseline change.
2. **`optimizing`:** after this baseline change merges, set `baseline_history_commit` to that exact merge commit and change only the status while implementing the optimization. The gate reads the before snapshot and before-phase manifest bytes back from immutable Git history, verifies that commit retained the exact `c7d7634…` source/skill trees, requires unchanged corpus/workflow shape and invariants, and enforces every reduction/regression/budget target. It deliberately requires no after snapshot, so the optimization can merge first.
3. **`after_frozen`:** in a separate change, generate the after snapshot with `source_commit` equal to the full merged optimization commit, add its SHA-256/path, and change the status. The gate verifies baseline ancestry, both snapshot source-tree IDs, and exact checked-out-source reproduction before retaining all optimization gates.

The predeclared after-phase targets are:

- at least 10% reduction in the aggregate independent-workflow total;
- no measured workflow may gain tokens;
- the active managed tool contract remains at or below 400 tokens;
- each common result and detail remains at or below 1,500 tokens; and
- every semantic, privacy, authority, warning, selection, and hydration invariant remains unchanged.

Changing the corpus, tokenizer, targets, before snapshot, or before hash during the optimization phase invalidates the comparison and requires a new independently reviewed benchmark phase ID.

## Measured surfaces

The v2 synthetic corpus measures:

- the stable `career-core` Skill discovery name/description contribution that Pi always includes in system context, excluding the machine-specific absolute location;
- the complete matching-task `skills/career-core/SKILL.md` content that Pi loads on demand, excluding linked reference files until separately requested;
- the actual active `career_run` contract, the three inactive raw contracts, and all registered contracts;
- representative direct `career_run` call arguments for context, analysis, matching, proposal reviews, variant review, detail hydration, and materialization;
- compact context, analyze, match, suggestion-review, replacement-review, variant-review, and materialization results;
- evidence, exact-change, and materialized-document detail responses;
- all six workbench prompt modes and the later reviewed-ID materialization handoff; and
- independent rollups for analysis-with-evidence, matching, reviewed suggestions, reviewed replacements, and tailored variant materialization.

Workflow totals sum the measured model-visible components as independent messages. Every measured career task includes one always-visible stable Skill discovery record and one full matching Skill load; referenced Skill files remain outside context until requested. The absolute `<location>` value in Pi's discovery XML is intentionally excluded because it is machine-specific, while the package-owned name and description are retained. Provider-specific wrappers, unrelated system-prompt text, hidden prompts, reasoning tokens, caching, and billing adjustments are excluded and must not be inferred from these numbers.

Each generated benchmark also records a SHA-256 over all exact measured surfaces, so equal-token wording drift cannot reproduce a frozen snapshot silently. Managed result/detail fixtures have a synthetic parity test against actual `career_run` serialization.

The benchmark also fails if it loses required warning/authority markers, regains nested `input_json` or model-visible schema discovery, changes call/turn structure, repeats the complete synthetic private source, drops exact selected IDs, or removes complete detail-hydration coverage. These invariants prevent apparent savings obtained by deleting required safety context.

## Commands

Collect the current source surfaces:

```bash
npm run bench:tokens
npm run bench:tokens -- --output /tmp/pi-career-token-current.json
```

Verify the active phase, immutable snapshot hash, exact reproduction, budgets, invariants, and before/current deltas:

```bash
npm run bench:tokens:compare
npm run bench:tokens:compare -- --output /tmp/pi-career-token-comparison.json
```

Reproduce the frozen before snapshot exactly:

```bash
npm run bench:tokens -- \
  --snapshot before \
  --source-commit c7d76344ccdfd8a370c8c69467d2022d9aea5d2e \
  --output /tmp/token-optimization-v1-before.json
```

The future after snapshot uses the same command with `--snapshot after` and the full merged optimization commit. Snapshot generation resolves and records that commit's exact `src/` and `skills/` tree IDs. Output paths must be absolute, outside the repository, and non-symlink targets; snapshot generation never edits the manifest or baseline automatically. Hash and phase transitions remain explicit review changes.

The tokenizer is lockfile-pinned `js-tiktoken` 1.0.21 with `o200k_base`. All resume, vacancy, result, and prompt content is synthetic. Token counts are stable context-occupancy signals, not provider billing guarantees.
