# Benchmark: Jev decision vs one-shot LLM decision

Measured 2026-10-07. Task: fill and submit the `https://httpbin.org/forms/post`
pizza order (3 text fields, 1 radio, 1 checkbox, submit) — 7 steps per run.

```bash
# Jev loop, 3 runs (needs a TypeSafe or AI Gateway key and ego lite)
ego-browser nodejs < docs/bench/run.mjs
# Baseline: one LLM call per decision over the same snapshot
node docs/bench/baseline.mjs anthropic/claude-haiku-4.5 anthropic/claude-sonnet-4.5 openai/gpt-5-mini
```

| Decision source | Median per decision | Range |
| --- | --- | --- |
| Jev (`jev-1.13.0`, TypeSafe) | ~270 ms | 234–630 ms |
| claude-haiku-4.5 | 1043 ms | 903–1522 ms |
| claude-sonnet-4.5 | 1431 ms | 1327–1750 ms |
| gpt-5-mini | 2835 ms | 2573–3261 ms |

Jev end to end: 7/7 steps verified in 3/3 runs, ~5.5 s wall, of which ~2.1 s
is Jev. `runs.json` holds the raw per-step timings.

Limits: the baseline is a single bare chat call per decision (about 540 prompt
tokens, no screenshot, no agent framework), so it is a lower bound for a real
agent turn. Accuracy of the baseline decisions is not scored; latency only.
