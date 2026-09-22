# ego-jev reference

Defaults live in `scripts/jev-loop.mjs` (`runJevLoop` destructuring); this file
explains what each knob is for.

## Options

| option | default | meaning |
| --- | --- | --- |
| `goal` | required | the user goal, verbatim |
| `values` | `{}` | fill/select values: `{key: "v"}` or `{key: {value, hint}}` |
| `verify` | — | `async (page) => bool`, run when Jev claims done; false → loop continues |
| `verifyRecheckMs` | 400 | grace wait before re-running a failed `verify` once in the same step — absorbs "done claimed while navigation still commits"; `0` disables |
| `maxSteps` | 20 | loop bound |
| `maxElements` | 120 | candidate cap (a11y refs first, DOM `dN` fills the rest) |
| `snapshotOptions` | viewport | e.g. `{scope:"full_page"}` or `{scope:"subtree", root:"@12"}`; empty viewport auto-falls back to `full_page` |
| `minOpConfidence` / `minTargetConfidence` | 0.45 / 0.35 | below → escalate |
| `doneThreshold` / `stuckThreshold` | 0.75 / 0.7 | noul triggers for done / blocked |
| `guard` | pay/delete/upload/confirm regex (+ 中文) | matching targets escalate; `null` disables |
| `backend` | `"auto"` | `"typesafe"` or `"gateway"` to force one |
| `ask` | auto backend | inject `(state, questions) => answers` for tests/other backends |
| `apiKey`, `baseUrl`, `gatewayBaseUrl`, `model`, `timeout` | — | backend overrides |
| `planner` | env-detected | who drives the loop — pass `"harness/model"` (e.g. `"devin/swe-2-high"`) or `{agent, model}`; defaults to env markers (`AI_AGENT`, `CLAUDECODE`, `CODEX_HOME`, …) which only identify the harness, not its model |

## Timings

Every result carries `result.timings`, on all exit paths:

| field | shape |
| --- | --- |
| `timings.totalMs` | wall time of the whole loop |
| `timings.model` | the model(s) that served the calls — the served version (`jev-1.13.0`) when the backend reports it, else the configured alias (`typesafe-ai/jev`, `opts.model`) or `custom` for an injected `ask` |
| `timings.tokens` | summed `{input, output}` tokens across calls, when the backend reports `usage` |
| `timings.planner` | the driving agent — `options.planner` verbatim, else the env-detected harness (model unknown unless passed) |
| `timings.llmMs` / `timings.llmCalls` | summed Jev latency and one `{seq, step, kind, ms, ok, model, backend, usage}` per request — `kind` is `decide`, `decide-retry` or `option_retry` |
| `timings.steps` | per-step `{step, op, snapshotMs, domMs, askMs, actMs, verifyMs, stepMs}` (`askMs` sums that step's calls) |

Served model and token usage ride back on the answers object under the
exported `ASK_META` symbol (`{model, usage:{inputTokens, outputTokens}}`); the
typesafe backend fills it from `body.model`/`body.usage`, the gateway from
`providerMetadata.gateway.routing.canonicalSlug`/`usage`. `ask.describe()`
(`{backend, model}`, attached by `makeAsk`) is the fallback for backends that
report nothing; an injected `ask` may provide the same function.

`formatTimings(result)` (exported from `jev-loop.mjs`) renders a compact
per-step table with per-call latency — print it for the user after the loop.

## Backend and keys

`auto` uses direct TypeSafe when `TYPESAFE_API_KEY` resolves, else the Vercel
AI Gateway; a gateway key misfiled under `TYPESAFE_API_KEY` still works (401 →
gateway, cached for the run).

| backend | endpoint | measured per step |
| --- | --- | --- |
| `typesafe` | `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest` | 300–550 ms (20–120 elements) |
| `gateway` | `POST https://ai-gateway.vercel.sh/v4/ai/evaluation-model`, model `typesafe-ai/jev` | 500–1500 ms, intermittent 503 |

Browser-side cost is negligible (snapshot 8–18 ms, DOM walk ~1 ms); Jev
latency scales with payload, so `target_fill`/`target_select` heads list only
role-compatible elements.

ego's nodejs runtime is a long-lived process that does not inherit the shell
env. Key lookup order: `opts.apiKey` → `process.env` →
`~/.config/ego-jev/secrets.env` → `export NAME=value` lines in `~/.zshenv` /
`~/.zshrc`; variable-name priority beats file order. Both keys live in
`secrets.env` (sourced by `.zshrc`). OpenRouter does not host Jev.

Pricing (console.typesafe.ai/settings/billing): $0.042 / MTok input, output
free, $5 monthly credit without a card. One step ≈ 11K tokens ≈ $0.0005.

## Candidate roles

a11y refs are offered when their role (compound ego roles normalized:
`comboboxgrouping` → `combobox`, `listboxoption` → `option`) is in
`ACTIONABLE` in `jev-loop.mjs`. DOM `dN` items come from
`collectDomInteractives`: native interactive tags, ARIA roles, onclick /
tabindex / contenteditable, `cursor:pointer`, with ancestor de-dup and
`href`-based de-dup against refs. Main-document `dN` click via
`[data-ego-jev=N]`; iframe `dN` click via recorded viewport coordinates.
