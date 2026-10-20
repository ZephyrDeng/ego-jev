# Benchmark: Jev decision vs one-shot LLM decision

Measured 2026-10-07. Task: fill and submit the `https://httpbin.org/forms/post`
pizza order (3 text fields, 1 radio, 1 checkbox, submit) — 7 steps per run.

```bash
# Jev loop, 3 runs (needs a TypeSafe or AI Gateway key and ego lite)
ego-browser nodejs -e "await import('file://$PWD/docs/bench/run.mjs')"
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

## Decision eval

`eval/` scores the loop's chosen action on recorded pages against the real
Jev, without a browser. Each case under `eval/cases/<name>/` holds one decision
point: `page.json` (snapshot, URL and in-page results per step), the step
screenshots, and `case.json` (goal, values, `prior` scripted answers for
earlier steps, `expect` — the acceptable actions).

```bash
# Replay all cases, 3 Jev calls each (needs TYPESAFE_API_KEY); exit 1 on a miss
node docs/bench/eval/run.mjs 3
# Same cases against another skill copy, e.g. the installed one
EGO_JEV_SKILL=~/.agents/skills/ego-jev node docs/bench/eval/run.mjs 3
# Recapture every case from live pages (Google included; needs ego lite)
ego-browser nodejs -e "await import('file://$PWD/docs/bench/eval/capture.mjs')"
```

Add a case whenever a real page exposes a decision bug: describe it in
`eval/cases.mjs`, capture it, then write `expect` in its `case.json` from the
refs and bounds in `page.json` (a case without `expect` is skipped). A pass is
2 hits in 3 runs. `google-filled` reproduces the v0.5.0 bug — the locate box
re-pointed the search-button click onto the filled field — and fails on 0.5.0.
Recapturing keeps `expect` but refs can shift, so recheck it after a capture.
