// jev-loop.test.ts — BDD specs for runJevLoop timings, model reporting and
// the verify-recheck optimization. Pure Node: the page and the Jev backend
// are mocked, no ego-browser or API key needed. Run: npx vitest run

import { describe, it, expect } from "vitest";
import type { Answers, Ask, CdpEvent, Page } from "./jev-loop.ts";
import {
  runJevLoop,
  formatTimings,
  parseSnapshot,
  ASK_META,
} from "./jev-loop.ts";

const SNAP = `root
  form
    textbox [ref=2, loc=css:input[name="q"]]
    button [ref=5, loc=css:button.go]
      text "Search"`;

const mockPage = (overrides: Partial<Page> = {}): Page => ({
  snapshot: async () => SNAP,
  evaluate: async () => [] as never,
  url: async () => "https://example.test/",
  click: async () => {},
  fill: async () => {},
  hover: async () => {},
  selectOption: async () => {},
  mouse: { click: async () => {} },
  keyboard: { insertText: async () => {} },
  waitForTimeout: async () => {},
  cdp: async () => ({}),
  events: async () => [],
  ...overrides,
});

const decide = (op: string, extra: Answers = {}): Answers => ({
  op: { choice: op, confidence: 0.9 },
  done: { noul: op === "done" ? 0.9 : 0.1 },
  stuck: { noul: 0.01 },
  ...extra,
});

const scriptedAsk = (script: Answers[]): Ask => {
  let n = 0;
  return async () => script[Math.min(n++, script.length - 1)]!;
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
      expect(s.stepMs).toBeGreaterThanOrEqual(s.askMs!);
    }
    expect(r.timings.steps[0].actMs).toBeGreaterThanOrEqual(0);
    expect(r.timings.steps[0].verifyMs).toBeUndefined();
    expect(r.timings.steps[1].verifyMs).toBeGreaterThanOrEqual(0);

    expect(r.timings.llmCalls.map((c) => c.seq)).toEqual([1, 2]);
    expect(r.timings.llmCalls.map((c) => c.kind)).toEqual(["decide", "decide"]);
    expect(r.timings.llmCalls.every((c) => c.ok && c.ms! >= 0)).toBe(true);
    expect(r.timings.llmMs).toBe(
      r.timings.llmCalls.reduce((a, c) => a + c.ms!, 0),
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
    expect(r.timings.llmCalls[0]!.usage!.inputTokens).toBe(11000);
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

describe("parseSnapshot naming", () => {
  it("given a table-cell label layout (HN-style form), then unnamed inputs take the preceding cell's text", () => {
    const snap = `root
  form
    table
      table_row
        table_cell
          text "title"
        table_cell
          textbox [ref=2, loc=css:input[name="title"]]
      table_row
        table_cell
          text "url"
        table_cell
          textbox [ref=3, loc=css:input[name="url"]]
      table_row
        table_cell
          text "text"
        table_cell
          textbox [ref=4, loc=css:textarea[name="text"]]`;
    const byRef = Object.fromEntries(parseSnapshot(snap).map((c) => [c.ref, c]));
    expect(byRef[2].name).toBe("title");
    expect(byRef[3].name).toBe("url");
    expect(byRef[4].name).toBe("text");
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
    expect(formatTimings({} as any)).toBe("jev timings: nothing recorded");
    expect(formatTimings({ timings: { steps: [] } } as any)).toBe(
      "jev timings: nothing recorded",
    );
  });
});

describe("runJevLoop record (opt-in network + cookies)", () => {
  const ev = (method: string, params: object): CdpEvent => ({ method, params });
  const reqEv = (id: string, url: string, type = "XHR", extra: object = {}) =>
    ev("Network.requestWillBeSent", { requestId: id, type, timestamp: 10, wallTime: 1700000000, request: { url, method: "GET", headers: { Authorization: "Bearer s3cret", Accept: "*/*" } }, ...extra });
  const respEv = (id: string, status = 200) => ev("Network.responseReceived", { requestId: id, response: { status, mimeType: "application/json", headers: { "Set-Cookie": "sid=1" } } });
  const doneEv = (id: string) => ev("Network.loadingFinished", { requestId: id, timestamp: 10.25, encodedDataLength: 42 });

  const recordingPage = ({ batches = [], cookies = [[], []] }: { batches?: CdpEvent[][]; cookies?: any[][] } = {}) => {
    const calls: string[] = [];
    let cookieCall = 0;
    let batch = 0;
    return {
      calls,
      page: mockPage({
        cdp: async (method: string) => {
          calls.push(method);
          if (method === "Network.getCookies") return { cookies: cookies[Math.min(cookieCall++, cookies.length - 1)] };
          if (method === "Network.getResponseBody") return { body: '{"ok":true}', base64Encoded: false };
          return {};
        },
        events: async () => batches[batch++] ?? [],
      }),
    };
  };
  const clickThenDone = () => scriptedAsk([
    decide("click", { target_click: { choice: "5", confidence: 0.9 } }),
    decide("done"),
  ]);

  it("given no record option, when the loop runs, then it never touches CDP and result.record is undefined", async () => {
    const { page, calls } = recordingPage();
    const r = await runJevLoop(page, { goal: "g", ask: clickThenDone(), verify: async () => true });
    expect(calls).toEqual([]);
    expect(r.record).toBeUndefined();
  });

  it("given record:true, when a click triggers XHR, then it is attributed to that step with redacted query and no headers", async () => {
    const { page } = recordingPage({
      batches: [[], [], [
        reqEv("a", "https://example.test/api?q=1&token=abc"),
        respEv("a"), doneEv("a"),
        reqEv("img", "https://example.test/x.png", "Image"),
        reqEv("ext", "chrome-extension://abc/x.js", "Script"),
      ]],
    });
    const r = await runJevLoop(page, { goal: "g", ask: clickThenDone(), verify: async () => true, record: true });
    expect(r.record!.network).toHaveLength(1);
    const [e] = r.record!.network;
    expect(e).toMatchObject({ step: 1, method: "GET", status: 200, type: "XHR", ms: 250, bytes: 42 });
    expect(e.url).toContain("token=%5Bredacted%5D");
    expect(e.url).toContain("q=1");
    expect(e.requestHeaders).toBeUndefined();
    expect(e.responseHeaders).toBeUndefined();
  });

  it("given headers:true, when recorded, then sensitive headers are redacted and others kept", async () => {
    const { page } = recordingPage({ batches: [[], [], [reqEv("a", "https://example.test/api"), respEv("a")]] });
    const r = await runJevLoop(page, { goal: "g", ask: clickThenDone(), verify: async () => true, record: { headers: true } });
    const [e] = r.record!.network;
    expect(e.requestHeaders).toEqual({ Authorization: "[redacted]", Accept: "*/*" });
    expect(e.responseHeaders!["Set-Cookie"]).toBe("[redacted]");
  });

  it("given cookies change during the run, then before/after/diff carry metadata but no values by default", async () => {
    const c = (name: string, value: string) => ({ name, value, domain: "example.test", path: "/", httpOnly: true, secure: true, size: 10 });
    const { page } = recordingPage({ cookies: [[c("a", "1")], [c("a", "2"), c("sid", "secret")]] });
    const r = await runJevLoop(page, { goal: "g", ask: clickThenDone(), verify: async () => true, record: true });
    expect(r.record!.cookies!.diff).toEqual({
      added: ["example.test|/|sid"], removed: [], changed: ["example.test|/|a"],
    });
    expect(JSON.stringify(r.record!.cookies)).not.toContain("secret");
    expect(r.record!.cookies!.after![0]!.value).toBeUndefined();
    expect(r.record!.cookies!.after![0]!.valueHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("given cookieValues:true, then values are included", async () => {
    const { page } = recordingPage({ cookies: [[], [{ name: "sid", value: "v", domain: "d", path: "/" }]] });
    const r = await runJevLoop(page, { goal: "g", ask: clickThenDone(), verify: async () => true, record: { cookieValues: true } });
    expect(r.record!.cookies!.after![0]!.value).toBe("v");
  });

  it("given record on, then cookies use URL-scoped getCookies (never getAllCookies) and Network is disabled at the end", async () => {
    const { page, calls } = recordingPage();
    await runJevLoop(page, { goal: "g", ask: clickThenDone(), verify: async () => true, record: true });
    expect(calls).not.toContain("Network.getAllCookies");
    expect(calls[0]).toBe("Network.enable");
    expect(calls.at(-1)).toBe("Network.disable");
  });

  it("given record on, then raw CDP never runs between a snapshot and its action (refs stay valid) and the result snapshot is refreshed", async () => {
    const log: string[] = [];
    const { page } = recordingPage();
    const orig = { snapshot: page.snapshot, cdp: page.cdp, click: page.click };
    page.snapshot = async (...a: Parameters<Page["snapshot"]>) => { log.push("snapshot"); return orig.snapshot(...a); };
    page.cdp = async (m: string, p?: object) => { log.push("cdp"); return orig.cdp(m, p); };
    page.click = async (...a: Parameters<Page["click"]>) => { log.push("click"); return orig.click(...a); };
    const r = await runJevLoop(page, { goal: "g", ask: clickThenDone(), verify: async () => true, record: true });
    const i = log.indexOf("click");
    expect(log.slice(log.lastIndexOf("snapshot", i), i + 1)).toEqual(["snapshot", "click"]);
    expect(log.at(-1)).toBe("snapshot");
    expect(r.record!.refsInvalidated).toBe(true);
  });

  it("given maxEntries, when exceeded, then oldest are dropped and counted", async () => {
    const { page } = recordingPage({
      batches: [[], [], [reqEv("1", "https://e.test/1"), reqEv("2", "https://e.test/2"), reqEv("3", "https://e.test/3")]],
    });
    const r = await runJevLoop(page, { goal: "g", ask: clickThenDone(), verify: async () => true, record: { maxEntries: 2 } });
    expect(r.record!.network.map((e) => e.url)).toEqual(["https://e.test/2", "https://e.test/3"]);
    expect(r.record!.dropped).toBe(1);
  });

  it("given a CDP failure at start, then the loop still runs and the error is reported", async () => {
    const page = mockPage({ cdp: async () => { throw new Error("no cdp"); }, events: async () => [] });
    const r = await runJevLoop(page, { goal: "g", ask: clickThenDone(), verify: async () => true, record: true });
    expect(r.status).toBe("done");
    expect(r.record!.errors![0]).toContain("no cdp");
  });

  it("given bodies:true, then XHR response bodies are captured at the end, capped", async () => {
    const { page } = recordingPage({ batches: [[], [], [reqEv("a", "https://e.test/api"), respEv("a"), doneEv("a")]] });
    const r = await runJevLoop(page, { goal: "g", ask: clickThenDone(), verify: async () => true, record: { bodies: true } });
    expect(r.record!.network[0].responseBody).toBe('{"ok":true}');
  });
});

describe("runJevLoop record across exit paths and steps", () => {
  const req = (id: string, url: string): CdpEvent => ({
    method: "Network.requestWillBeSent",
    params: { requestId: id, type: "XHR", timestamp: 1, wallTime: 1, request: { url, method: "GET", headers: {} } },
  });
  const batchedPage = (batches: CdpEvent[][]) => {
    let i = 0;
    const calls: string[] = [];
    return {
      calls,
      page: mockPage({
        cdp: async (m: string) => { calls.push(m); return m === "Network.getCookies" ? { cookies: [] } : {}; },
        events: async () => batches[i++] ?? [],
      }),
    };
  };
  const click = decide("click", { target_click: { choice: "5", confidence: 0.9 } });

  it("given two clicks that each trigger a request, then each request is attributed to the step that caused it", async () => {
    // batches: start() clear | step1 top | step2 top (after click 1) | step3 top (after click 2)
    const { page } = batchedPage([[], [], [req("a", "https://e.test/a")], [req("b", "https://e.test/b")]]);
    const ask = scriptedAsk([click, click, decide("done")]);
    const r = await runJevLoop(page, { goal: "g", ask, verify: async () => true, record: true });
    expect(r.record!.network.map((e) => [e.id, e.step])).toEqual([["a", 1], ["b", 2]]);
  });

  it("given events arriving before any action, then they are attributed to step 0", async () => {
    const { page } = batchedPage([[], [req("early", "https://e.test/early")]]);
    const r = await runJevLoop(page, { goal: "g", ask: scriptedAsk([decide("done")]), verify: async () => true, record: true });
    expect(r.record!.network[0]).toMatchObject({ id: "early", step: 0 });
  });

  it("given a request that lands after the last action, then the final drain attributes it to that action's step", async () => {
    // batches: start | step1 top | step2 top (done, nothing acted) -> stop() drain gets the late one
    const { page } = batchedPage([[], [], [], [req("late", "https://e.test/late")]]);
    const ask = scriptedAsk([click, decide("done")]);
    const r = await runJevLoop(page, { goal: "g", ask, verify: async () => true, record: true });
    expect(r.record!.network.map((e) => [e.id, e.step])).toEqual([["late", 1]]);
  });

  it("given the loop escalates, then the record is still returned and the recorder is shut down", async () => {
    const { page, calls } = batchedPage([[], []]);
    const r = await runJevLoop(page, { goal: "g", ask: scriptedAsk([decide("escalate")]), record: true });
    expect(r.status).toBe("escalate");
    expect(r.record!.refsInvalidated).toBe(true);
    expect(calls.at(-1)).toBe("Network.disable");
  });

  it("given the loop hits maxSteps, then the record is still returned and the recorder is shut down", async () => {
    const { page, calls } = batchedPage([[], [], [req("a", "https://e.test/a")]]);
    const r = await runJevLoop(page, { goal: "g", ask: scriptedAsk([decide("wait")]), maxSteps: 2, record: true });
    expect(r.status).toBe("max_steps");
    expect(r.record!.network).toHaveLength(1);
    expect(calls.at(-1)).toBe("Network.disable");
  });

  it("given verify rejects a done claim, then recording keeps running until the loop truly finishes", async () => {
    let checks = 0;
    const { page, calls } = batchedPage([[], [], [req("a", "https://e.test/a")], []]);
    const ask = scriptedAsk([decide("done"), click, decide("done")]);
    const r = await runJevLoop(page, { goal: "g", ask, verifyRecheckMs: 0, verify: async () => ++checks > 1, record: true });
    expect(r.status).toBe("done");
    expect(calls.filter((c) => c === "Network.enable")).toHaveLength(1);
    expect(calls.filter((c) => c === "Network.disable")).toHaveLength(1);
  });

  it("given recording is off, then the result snapshot is the loop's last snapshot, not an extra fetch", async () => {
    let snaps = 0;
    const page = mockPage({ snapshot: async () => { snaps++; return SNAP; } });
    await runJevLoop(page, { goal: "g", ask: scriptedAsk([decide("done")]), verify: async () => true });
    expect(snaps).toBe(1);
  });

  it("given recording is on with both features off, then no extra snapshot is taken", async () => {
    let snaps = 0;
    const page = mockPage({ snapshot: async () => { snaps++; return SNAP; }, cdp: async () => ({}), events: async () => [] });
    await runJevLoop(page, { goal: "g", ask: scriptedAsk([decide("done")]), verify: async () => true, record: { network: false, cookies: false } });
    expect(snaps).toBe(1);
  });
});
