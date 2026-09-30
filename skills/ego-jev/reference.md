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

## Maintenance tests

Ordinary tasks start from the [user's task context](SKILL.md#task-boundary).
Author examples, README/demo content and the selftest are for explicit
test/demo requests, never the default entry or a missing-key fallback.

`npm test` runs Node regression tests with mocked Pages and model/network
responses; `npm run typecheck` checks the TypeScript contract. They do not
prove a live browser or real Jev service works.

For an explicitly requested browser mechanics demo, run from this skill's
directory: `ego-browser nodejs < scripts/selftest.mjs`. The selftest injects
scripted mock decisions, so it needs no Jev backend key and sends no model
requests. It **does** require ego-browser, creates a TaskSpace, navigates to
`https://httpbin.org/forms/post`, fills demo values and mutates the page DOM.
It depends on that external site and browser connectivity; it is not an
offline test and does not validate real Jev authentication, decisions or
service latency. Follow `ego-browser`'s ownership and cleanup rules for that
explicit test task.

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
| `ask` | auto backend | inject `(state, questions) => answers` for tests/other backends; no built-in key required. An optional `ask.preflight()` owns that backend's configuration check |
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

Missing credentials in the built-in backend return the same `RunResult`
structure with `status: "escalate"`, configuration guidance in `reason`,
`steps: 0`, empty `snapshot`/`url`, `trace: []` (omitted with `keepTrace: false`)
and empty `timings.steps` / `timings.llmCalls`, `llmMs: 0`. No Page, recording
or network operation runs; configuration checks do not count as model calls.

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

`auto` uses direct TypeSafe when `apiKey` or `TYPESAFE_API_KEY` resolves, else
the Vercel AI Gateway. An explicit `apiKey` defaults to the direct route;
pair a gateway key with `backend: "gateway"` to select it without an auth
probe. In `auto`, a gateway key misfiled under `TYPESAFE_API_KEY` or passed as
`apiKey` still falls back on the initial direct 401/403; the gateway route is
cached for the run. Explicit `backend: "typesafe"` / `"gateway"` keeps that
route. Gateway lookup retains the `TYPESAFE_API_KEY` fallback, preferring
`AI_GATEWAY_API_KEY` within each lookup tier.

| backend | endpoint | measured per step |
| --- | --- | --- |
| `typesafe` | `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest` | 300–550 ms (20–120 elements) |
| `gateway` | `POST https://ai-gateway.vercel.sh/v4/ai/evaluation-model`, model `typesafe-ai/jev` | 500–1500 ms, intermittent 503 |

Browser-side cost is negligible (snapshot 8–18 ms, DOM walk ~1 ms); Jev
latency scales with payload, so `target_fill`/`target_select` heads list only
role-compatible elements.

Check configuration in the `ego-browser nodejs` runtime that will make the
requests; its environment can differ from the calling shell. Key lookup
order: `opts.apiKey` → `process.env` →
`~/.config/ego-jev/secrets.env` → `export NAME=value` lines in `~/.zshenv` /
`~/.zshrc` (paths use that runtime's `HOME`); variable-name priority beats
file order. Files are parsed as simple assignments, not executed or sourced.
An explicit blank `apiKey` fails instead of using an unrelated ambient key;
blank environment values are skipped. Configure a key locally through a
secure channel, never print it or ask for it in chat. OpenRouter does not host Jev.

### Preflight

Before creating a TaskSpace or navigating, call exported
`preflightJev(backendOptions)` in the same runtime and with the same options
as the intended loop. It shares the built-in backend resolver and returns
only `{ok: true, backend: "typesafe" | "gateway" | "custom"}` or
`{ok: false, backend, reason}`. It takes no Page, sends no network/model
request, creates no TaskSpace and exposes no credential value. A successful
preflight proves a key resolves, not its validity, balance or provider health.

Handle `ready.ok: false` as a result, as shown in the [Run example](SKILL.md#run):
pause the Jev branch and ask the user once whether they want to configure a
TypeSafe / Vercel key securely on this machine, can identify an existing
configuration location, or prefer plain ego-browser for the same goal. Never
request or print a plaintext key or automatically change real configuration.
While awaiting the answer, create no TaskSpace or Page, navigate no Page,
make no model request and do not poll or retry. If the user has already
explicitly refused configuration or selected the fallback, reuse that choice
without asking again. Continue fallback with the same user goal, URL/Page,
supplied values and any existing TaskSpace and ownership; do not switch to an
author test page.

`reason` supplies safe guidance for `~/.config/ego-jev/secrets.env`
(`export NAME=value`), current-runtime environment or an explicit `apiKey`
with `backend`. When the user says a key already exists or is now configured,
use the supported lookup without exposing its value and rerun `preflightJev`
with fresh backend options in the actual `ego-browser nodejs` runtime.
`makeAsk(options).preflight()` uses that ask's privately cached configuration;
recreate the ask after a configuration change. Resume Jev only after
`ready.ok: true`; otherwise keep it paused and report safe guidance without
repeating the question or busy waiting.

`runJevLoop` invokes the built-in preflight before snapshot/DOM collection and
before opt-in recording starts. Its missing-key `escalate` result follows the
same one-time question rule. Missing-key errors stop without the 800ms retry
wait; temporary network failures, 5xx and timeouts retain the existing single
bounded retry.

For a custom/mock `ask`, `preflightJev({ask})` skips built-in credentials and
does not call the decision function. If the ask supplies `preflight`, its
hook is used instead; the custom hook owns any effects and configuration.

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
