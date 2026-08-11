# Agent-context benchmarks

The Career workflow benchmark freezes synthetic, model-visible context surfaces using `js-tiktoken` 1.0.21 and the `o200k_base` encoding. It contains no real resume, vacancy, session, provider, or credential content.

Measured surfaces:

- active compact `career_run` tool contract
- registered but normally inactive raw Career Core contracts
- all registered contracts as a diagnostic ceiling
- representative compact analyze, match, suggestion-review, replacement-review, variant-review, and materialization results
- representative evidence, exact-change, and materialized-document detail hydration
- the existing synthetic workbench editor prompt

Run:

```bash
npm run bench:tokens
npm run bench:tokens -- --output /tmp/pi-career-token-candidate.json
```

The reviewed baseline is [`baselines/career-run-v1.json`](baselines/career-run-v1.json). Its `before` values preserve the design-review measurements that motivated the migration; `candidate` values must reproduce from the current source and synthetic corpus.

Token counts are context-window occupancy signals, not provider billing guarantees. Provider wrappers and prompt caching can change billed usage.
