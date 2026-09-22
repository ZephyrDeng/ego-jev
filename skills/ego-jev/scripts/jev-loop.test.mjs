// jev-loop.test.mjs — BDD specs for runJevLoop timings, model reporting and
// the verify-recheck optimization. Pure Node: the page and the Jev backend
// are mocked, no ego-browser or API key needed. Run: npx vitest run

import { describe, it, expect } from "vitest";
import { runJevLoop, formatTimings, ASK_META } from "./jev-loop.mjs";

const SNAP = `root
  form
    textbox [ref=2, loc=css:input[name="q"]]
    button [ref=5, loc=css:button.go]
      text "Search"`;

const mockPage = (overrides = {}) => ({
  snapshot: async () => SNAP,
  evaluate: async () => [],
  url: async () => "https://example.test/",
  click: async () => {},
  fill: async () => {},
  hover: async () => {},
  selectOption: async () => {},
  mouse: { click: async () => {} },
  keyboard: { insertText: async () => {} },
  waitForTimeout: async () => {},
  ...overrides,
});

const decide = (op, extra = {}) => ({
  op: { choice: op, confidence: 0.9 },
  done: { noul: op === "done" ? 0.9 : 0.1 },
  stuck: { noul: 0.01 },
  ...extra,
});

const scriptedAsk = (script) => {
  let n = 0;
  return async () => script[Math.min(n++, script.length - 1)];
};

describe("runJevLoop timings", () => {
  it("given a fill+done run, when it finishes, then every step has phase timings and llmCalls lists each request", async () => {
    const ask = scriptedAsk([
      decide("fill", { target_fill: { choice: "2", confidence: 0.9 } }),
      decide("done"),
    ]);
    const r = await runJevLoop(mockPage(), {
      goal: "fill q", values: { q: "x" }, ask, verify: async () => true,
    });

    expect(r.status).toBe("done");
    expect(r.timings.steps).toHaveLength(2);
    for (const s of r.timings.steps) {
      expect(s.snapshotMs).toBeGreaterThanOrEqual(0);
      expect(s.domMs).toBeGreaterThanOrEqual(0);
      expect(s.askMs).toBeGreaterThanOrEqual(0);
      expect(s.stepMs).toBeGreaterThanOrEqual(s.askMs);
    }
    expect(r.timings.steps[0].actMs).toBeGreaterThanOrEqual(0);
    expect(r.timings.steps[0].verifyMs).toBeUndefined();
    expect(r.timings.steps[1].verifyMs).toBeGreaterThanOrEqual(0);

    expect(r.timings.llmCalls.map((c) => c.seq)).toEqual([1, 2]);
    expect(r.timings.llmCalls.map((c) => c.kind)).toEqual(["decide", "decide"]);
    expect(r.timings.llmCalls.every((c) => c.ok && c.ms >= 0)).toBe(true);
    expect(r.timings.llmMs).toBe(
      r.timings.llmCalls.reduce((a, c) => a + c.ms, 0),
    );
    expect(r.timings.totalMs).toBeGreaterThanOrEqual(r.timings.llmMs);
  });

  it("given a flaky backend, when decide fails once, then the failed call and the retry are separate entries", async () => {
    let n = 0;
    const ask = async () => {
      if (n++ === 0) throw new Error("gateway 503");
      return decide("done");
    };
    const r = await runJevLoop(mockPage(), { goal: "x", ask, verifyRecheckMs: 0 });

    expect(r.status).toBe("done");
    expect(r.timings.llmCalls.map((c) => c.kind)).toEqual([
      "decide",
      "decide-retry",
    ]);
    expect(r.timings.llmCalls[0].ok).toBe(false);
    expect(r.timings.llmCalls[1].ok).toBe(true);
  });

  it("given a page with no actionable elements, when the loop escalates, then timings is still attached", async () => {
    const r = await runJevLoop(mockPage({ snapshot: async () => "root" }), {
      goal: "x", ask: async () => decide("done"),
    });

    expect(r.status).toBe("escalate");
    expect(r.reason).toBe("no actionable elements");
    expect(r.timings.steps).toHaveLength(1);
    expect(r.timings.steps[0].stepMs).toBeGreaterThanOrEqual(0);
    expect(r.timings.llmCalls).toHaveLength(0);
  });

  it("given done before navigation commits, when verify fails once, then it rechecks in the same step without another llm call", async () => {
    let checks = 0;
    const verify = async () => ++checks > 1;
    const r = await runJevLoop(mockPage(), {
      goal: "x", ask: scriptedAsk([decide("done")]), verify, verifyRecheckMs: 1,
    });

    expect(r.status).toBe("done");
    expect(r.verified).toBe(true);
    expect(checks).toBe(2);
    expect(r.timings.llmCalls).toHaveLength(1);
    expect(r.timings.steps[0].verifyMs).toBeGreaterThanOrEqual(0);
  });

  it("given verify keeps failing, when the grace recheck also fails, then the loop continues", async () => {
    const r = await runJevLoop(mockPage(), {
      goal: "x",
      ask: scriptedAsk([decide("done"), decide("escalate")]),
      verify: async () => false,
      verifyRecheckMs: 1,
    });

    expect(r.status).toBe("escalate");
    expect(r.reason).toBe("jev escalated");
    expect(r.timings.steps).toHaveLength(2);
    expect(r.timings.steps[0].verifyMs).toBeGreaterThanOrEqual(0);
  });

  it("given max_steps is hit, then timings still describes every step", async () => {
    const r = await runJevLoop(mockPage(), {
      goal: "x", ask: async () => decide("scroll"), maxSteps: 2,
    });

    expect(r.status).toBe("max_steps");
    expect(r.timings.steps).toHaveLength(2);
    expect(r.timings.llmCalls).toHaveLength(2);
  });

  it("given a backend describe(), then each call records the model and timings.model summarizes it", async () => {
    const ask = scriptedAsk([decide("done")]);
    ask.describe = () => ({ backend: "typesafe", model: "jev-latest" });
    const r = await runJevLoop(mockPage(), { goal: "x", ask, verifyRecheckMs: 0 });

    expect(r.timings.llmCalls[0].model).toBe("jev-latest");
    expect(r.timings.llmCalls[0].backend).toBe("typesafe");
    expect(r.timings.model).toBe("jev-latest");
  });

  it("given the backend reports a served model and usage, then they override the configured alias", async () => {
    const ask = async () => {
      const a = decide("done");
      a[ASK_META] = {
        model: "jev-1.13.0",
        usage: { inputTokens: 11000, outputTokens: 20 },
      };
      return a;
    };
    ask.describe = () => ({ backend: "typesafe", model: "jev-latest" });
    const r = await runJevLoop(mockPage(), { goal: "x", ask, verifyRecheckMs: 0 });

    expect(r.timings.llmCalls[0].model).toBe("jev-1.13.0");
    expect(r.timings.llmCalls[0].usage.inputTokens).toBe(11000);
    expect(r.timings.model).toBe("jev-1.13.0");
    expect(r.timings.tokens).toEqual({ input: 11000, output: 20 });
    expect(formatTimings(r)).toContain("jev-1.13.0");
    expect(formatTimings(r)).toContain("11.0K tok in");
  });

  it("given a planner option, then timings.planner records it verbatim", async () => {
    const r = await runJevLoop(mockPage(), {
      goal: "x", ask: scriptedAsk([decide("done")]), verifyRecheckMs: 0,
      planner: "devin/swe-2-high",
    });
    expect(r.timings.planner).toBe("devin/swe-2-high");
    expect(formatTimings(r)).toContain("planner devin/swe-2-high");
  });

  it("given a planner object, then agent and model join into one label", async () => {
    const r = await runJevLoop(mockPage(), {
      goal: "x", ask: scriptedAsk([decide("done")]), verifyRecheckMs: 0,
      planner: { agent: "claude-code", model: "sonnet-4.5" },
    });
    expect(r.timings.planner).toBe("claude-code/sonnet-4.5");
  });

  it("given no planner option, then the harness is detected from env markers", async () => {
    const keys = ["AI_AGENT", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CODEX_HOME", "CODEX_CI", "CURSOR_AGENT", "GEMINI_CLI"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    for (const k of keys) delete process.env[k];
    process.env.AI_AGENT = "devin_3000-11-1_agent";
    try {
      const r = await runJevLoop(mockPage(), {
        goal: "x", ask: scriptedAsk([decide("done")]), verifyRecheckMs: 0,
      });
      expect(r.timings.planner).toBe("devin-3000-11-1");
    } finally {
      for (const k of keys) {
        if (saved[k] == null) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });

  it("given an injected ask without describe(), then the model falls back to custom", async () => {
    const r = await runJevLoop(mockPage(), {
      goal: "x", ask: scriptedAsk([decide("done")]), verifyRecheckMs: 0,
    });
    expect(r.timings.llmCalls[0].model).toBe("custom");
    expect(r.timings.model).toBe("custom");
  });

  it("given a failing selectOption, when the option_retry ask recovers it, then that call is recorded too", async () => {
    let selectCalls = 0;
    const page = mockPage({
      selectOption: async () => {
        if (selectCalls++ === 0)
          throw new Error('selectOption failed: value="a", label="Apple"');
      },
    });
    const ask = scriptedAsk([
      decide("select", { target_select: { choice: "5", confidence: 0.9 } }),
      { option_retry: { choice: "Apple" } },
      decide("done"),
    ]);
    const r = await runJevLoop(page, {
      goal: "pick Apple", values: { fruit: "Apple" }, ask, verifyRecheckMs: 0,
    });

    expect(r.status).toBe("done");
    expect(r.timings.llmCalls.map((c) => c.kind)).toEqual([
      "decide",
      "option_retry",
      "decide",
    ]);
  });
});

describe("formatTimings", () => {
  it("renders one row per step, the per-call line, and the model", async () => {
    const ask = scriptedAsk([
      decide("fill", { target_fill: { choice: "2", confidence: 0.9 } }),
      decide("done"),
    ]);
    ask.describe = () => ({ backend: "typesafe", model: "jev-latest" });
    const r = await runJevLoop(mockPage(), {
      goal: "x", values: { q: "x" }, ask, verifyRecheckMs: 0,
    });
    const out = formatTimings(r);

    expect(out).toContain("jev timings · 2 steps");
    expect(out).toContain("jev-latest");
    expect(out).toContain("vrf");
    expect(out).toMatch(/#1 s1 decide \d+ms/);
    expect(out).toMatch(/#2 s2 decide \d+ms/);
  });

  it("given no timings, then it says so instead of crashing", () => {
    expect(formatTimings({})).toBe("jev timings: nothing recorded");
    expect(formatTimings({ timings: { steps: [] } })).toBe(
      "jev timings: nothing recorded",
    );
  });
});
