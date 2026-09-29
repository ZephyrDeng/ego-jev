# ego-jev reference

Defaults live in `scripts/jev-loop.ts` (`runJevLoop` destructuring); this file
explains what each knob is for.

## Source layout

TypeScript, loaded as-is by ego's Node 24 runtime through native type
stripping (no build, no emitted JS). Keep to erasable syntax only: no `enum`,
`namespace` or constructor parameter properties, and import siblings with the
`.ts` extension. `npm run typecheck` (`tsc`, strict) and `npm test` (vitest)
gate changes; `scripts/selftest.mjs` stays plain JS because it is piped to
`ego-browser nodejs` on stdin, where types are not stripped.

| file | role |
| --- | --- |
| `scripts/jev-loop.ts` | loop, snapshot parsing, questions, backends, timings |
| `scripts/record.ts` | opt-in network/cookie recorder |
| `scripts/types.ts` | `Page` (the ego-browser subset in use) and CDP event types |

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
| `record` | off | `true` or an object, see [Record](#record-opt-in) |
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

`formatTimings(result)` (exported from `jev-loop.ts`) renders a compact
per-step table with per-call latency — print it for the user after the loop.

## Record (opt-in)

`record` is off by default and adds no CDP calls when unset. `record: true`
enables request and cookie **metadata**; an object overrides individual knobs:

| knob | default | meaning |
| --- | --- | --- |
| `network` | true | record requests (`Network.enable`, drained per step through `page.events()`) |
| `cookies` | true | cookie jar of the current URL before and after the loop, plus a diff |
| `resourceTypes` | `["Document","XHR","Fetch"]` | request types kept; `null` keeps all http(s) types. Non-http(s) (e.g. `chrome-extension://`) is always dropped |
| `headers` | false | request/response headers; `authorization`, `cookie`, `set-cookie` and `x-*token/key/secret/auth/csrf*` are replaced by `[redacted]` |
| `bodies` | false | request post data and XHR/fetch response bodies (last `maxBodies`=20, each capped at `maxBodyBytes`=4096). May contain credentials |
| `cookieValues` | false | include cookie values; otherwise only name/domain/path/expiry/flags/size and an 8-hex `valueHash` for change detection |
| `redactQuery` | `/token\|key\|sig\|auth\|secret\|passw\|session\|code\|csrf\|jwt/i` | URL query params whose value becomes `[redacted]` (RegExp or string array) |
| `maxEntries` | 500 | ring buffer; overflow is counted in `record.dropped` |
| `dir` | null | also write `jev-<time>.jsonl` (dir `0700`, file `0600`): one `request` line per entry, one `cookies` line |

`result.record`: `{network, cookies: {before, after, diff}, dropped?, errors?, file?, refsInvalidated}`.
A network entry: `{id, step, type, method, url, status, mime, ms, bytes, cached?, failed?, redirectTo?, at}`.
`step` is the step whose action caused the request (`0` = before the first action).

Constraints, measured on ego lite:

- Any `page.cdp()` call invalidates snapshot refs; `page.events()` and
  `page.evaluate()` do not. The recorder therefore calls CDP only before the
  first snapshot (`Network.enable`, first `Network.getCookies`) and after the
  last action (bodies, second `getCookies`, `Network.disable`), then retakes
  `result.snapshot` so refs from it stay valid.
- `page.events()` returns and clears the buffer, so the recorder is its only
  consumer while the loop runs; `Network.disable` runs when the loop exits.
- Cookies use `Network.getCookies({urls:[page url]})`. `Network.getAllCookies`
  returns the whole profile (thousands of cookies across the user's other
  sites) and is never used.
- Requests that finish after the loop returns are not captured; a CDP failure
  at start disables recording and reports it in `record.errors`.

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
`ACTIONABLE` in `jev-loop.ts`. DOM `dN` items come from
`collectDomInteractives`: native interactive tags, ARIA roles, onclick /
tabindex / contenteditable, `cursor:pointer`, with ancestor de-dup and
`href`-based de-dup against refs. Main-document `dN` click via
`[data-ego-jev=N]`; iframe `dN` click via recorded viewport coordinates.
