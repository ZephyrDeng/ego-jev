# ego-jev

[![skills.sh](https://skills.sh/b/ZephyrDeng/ego-jev)](https://skills.sh/ZephyrDeng/ego-jev)

An [agent skill](https://skills.sh) that gives [ego lite](https://lite.ego.app/)
a Jev (TypeSafe System One) inner loop: one ~0.4 s typed decision per DOM step
instead of a full LLM turn.

ego executes; Jev decides. Each step: snapshot → number the interactive
elements (a11y refs `@N` + DOM-discovered clickables `dN`) → one System One
call picks the operation and its target together → ego clicks/fills/selects.
Jev never writes text and never sees a screenshot. Login, payment, free text,
canvas and content reading escalate back to the planner.

Sibling project: [jev-ultrafast](https://github.com/browser-use/jev-ultrafast)
runs the same idea as a standalone browser agent (Zürich → London on Google
Flights in 7.1 s). This skill brings that loop into ego lite so an agent keeps
the user's real browser, sessions and logins.

## Requirements

- [ego lite](https://lite.ego.app/) installed and onboarded — it provides the
  `ego-browser` command and the TaskSpace/Page runtime this skill drives.
- The `ego-browser` agent skill (TaskSpace and Page rules; ego-jev only
  replaces the per-step "which element" judgment).
- One backend key:
  - `TYPESAFE_API_KEY` from [console.typesafe.ai](https://console.typesafe.ai)
    (fastest, ~300–550 ms/step), or
  - `AI_GATEWAY_API_KEY` for Jev through the Vercel AI Gateway.
  - Put either in `~/.config/ego-jev/secrets.env` (`export NAME=value`).

## Install

```bash
npx skills add ZephyrDeng/ego-jev
```

## Use

Read [`SKILL.md`](SKILL.md) — it is the entry point your agent loads. The
decision loop itself is dependency-free Node in
[`scripts/jev-loop.mjs`](scripts/jev-loop.mjs); options, thresholds, backends
and latency numbers are in [`reference.md`](reference.md).

Offline smoke test (mock decider, no key, runs inside ego-browser):

```bash
ego-browser nodejs < scripts/selftest.mjs
```

## License

[MIT](LICENSE)
