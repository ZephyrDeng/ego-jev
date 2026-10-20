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

  it("given screenshot mode, when Jev picks the unlabeled click, then it clicks the box point with page.mouse", async () => {
    let clicks: { x: number; y: number }[] = [];
    const page = mockPage({ mouse: { click: async (x: number, y: number) => { clicks.push({ x, y }); } } });
    // The bounds+downscale evaluate isn't browser real in vitest — stub it
    // to report the raw png passthrough (scale 1) and no element bounds.
    page.evaluate = (async (fn: unknown, arg: unknown) =>
      (arg as { sels?: unknown[] } | undefined)?.sels
        ? { w: 800, h: 600, b64: null, bounds: (arg as { sels: unknown[] }).sels.map(() => null) }
        : []) as Page["evaluate"];
    const answers = [
      decide("click", {
        target_click: { choice: "unlabeled", confidence: 0.9 },
        locate_visible: { noul: 0.9 },
        locate: { box: { top: 0.4, bottom: 0.6, left: 0.2, right: 0.4 } },
      }),
      decide("done"),
    ];
    let n = 0;
    const ask: Ask = async (state, questions, assets) => {
      expect(state.screenshot).toMatch(/^img[0-9a-f]+shot$/);
      expect(questions.locate?.type).toBe("box");
      expect(questions.target_click?.criteria?.unlabeled).toBeTruthy();
      expect(assets?.[state.screenshot!]?.image?.format).toBe("png");
      return answers[Math.min(n++, answers.length - 1)]!;
    };
    const fs = await import("node:fs");
    const dir = fs.mkdtempSync("/tmp/ego-jev-shot-");
    const shot = `${dir}/shot.png`;
    fs.writeFileSync(shot, fs.readFileSync(new URL("./fixture-800x600.png", import.meta.url)));
    page.screenshot = async () => shot;
    try {
      const r = await runJevLoop(page, { goal: "click the cell", ask, screenshot: true, verifyRecheckMs: 0 });
      expect(r.status).toBe("done");
      expect(clicks).toEqual([{ x: 240, y: 300 }]);
      expect(r.trace![0].ref).toBe("point");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("given screenshot mode, when the locate box lands on a candidate, then the click upgrades to its DOM locator", async () => {
    let refClicks: string[] = [];
    let mouseClicks: { x: number; y: number }[] = [];
    const page = mockPage({
      click: async (sel: string) => { refClicks.push(sel); },
      mouse: { click: async (x: number, y: number) => { mouseClicks.push({ x, y }); } },
    });
    page.evaluate = (async (fn: unknown, arg: unknown) =>
      (arg as { sels?: unknown[] } | undefined)?.sels
        ? { w: 800, h: 600, b64: null, bounds: [null, { x: 200, y: 260, w: 80, h: 80 }] }
        : []) as Page["evaluate"];
    const answers = [
      decide("click", {
        target_click: { choice: "unlabeled", confidence: 0.9 },
        locate_visible: { noul: 0.9 },
        locate: { box: { top: 0.4, bottom: 0.6, left: 0.2, right: 0.4 } },
      }),
      decide("done"),
    ];
    let n = 0;
    const ask: Ask = async () => answers[Math.min(n++, answers.length - 1)]!;
    const fs = await import("node:fs");
    const dir = fs.mkdtempSync("/tmp/ego-jev-shot-");
    const shot = `${dir}/shot.png`;
    fs.writeFileSync(shot, fs.readFileSync(new URL("./fixture-800x600.png", import.meta.url)));
    page.screenshot = async () => shot;
    try {
      const r = await runJevLoop(page, { goal: "x", ask, screenshot: true, verifyRecheckMs: 0 });
      expect(r.status).toBe("done");
      expect(refClicks).toEqual(["@5"]);
      expect(mouseClicks).toEqual([]);
      expect(r.trace![0].name).toContain("locate-verified");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("given screenshot mode on a tiny viewport, when the image is under 280px, then it escalates without asking", async () => {
    const page = mockPage({ screenshot: async () => {
      const dir = await import("node:fs").then((fs) => fs.mkdtempSync("/tmp/ego-jev-tiny-"));
      const p = `${dir}/tiny.png`;
      const png = Buffer.alloc(64);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
      Buffer.from([0, 0, 0, 0xc8]).copy(png, 16); // w=200
      Buffer.from([0, 0, 0, 0xc8]).copy(png, 20); // h=200
      await import("node:fs").then((fs) => fs.writeFileSync(p, png));
      return p;
    } });
    let asked = 0;
    const r = await runJevLoop(page, {
      goal: "x", ask: async () => { asked++; return decide("done"); },
      screenshot: true, verifyRecheckMs: 0,
    });
    expect(r.status).toBe("escalate");
    expect(r.reason).toContain("280px");
    expect(asked).toBe(0);
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

describe("runJevLoop timeouts", () => {
  it("given a page action that never settles, when pageTimeoutMs passes, then the step fails and the loop escalates instead of hanging", async () => {
    const page = mockPage({ click: () => new Promise(() => {}) });
    const ask = scriptedAsk([decide("click", { target_click: { choice: "5", confidence: 0.9 } })]);
    const r = await runJevLoop(page, { goal: "x", ask, pageTimeoutMs: 30 });
    expect(r.status).toBe("escalate");
    expect(r.reason).toMatch(/click action timed out/);
  });

  it("given a hung Jev backend, when deadlineMs passes, then the run escalates with a timeout reason", async () => {
    const r = await runJevLoop(mockPage(), { goal: "x", ask: () => new Promise(() => {}), deadlineMs: 50 });
    expect(r.status).toBe("escalate");
    expect(r.reason).toMatch(/^timeout: run exceeded deadlineMs=50/);
    expect(r.timings.totalMs).toBeLessThan(2000);
  });

  it("given a hung snapshot, when it times out, then the run escalates rather than throwing", async () => {
    const r = await runJevLoop(mockPage({ snapshot: () => new Promise(() => {}) }), {
      goal: "x", ask: scriptedAsk([decide("done")]), pageTimeoutMs: 30,
    });
    expect(r.status).toBe("escalate");
    expect(r.reason).toMatch(/snapshot failed: snapshot timed out/);
  });
});

describe("runJevLoop visual debug report", () => {
  const withShot = async (fn: (dir: string, shot: string) => Promise<void>) => {
    const fs = await import("node:fs");
    const dir = fs.mkdtempSync("/tmp/ego-jev-dbg-");
    const shot = `${dir}/shot.png`;
    fs.writeFileSync(shot, fs.readFileSync(new URL("./fixture-800x600.png", import.meta.url)));
    try { await fn(dir, shot); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };

  it("given a downscaled screenshot, when Jev locates an unlabeled target, then the click maps box fractions onto CSS px with no scale factor", async () => {
    await withShot(async (_dir, shot) => {
      const clicks: { x: number; y: number }[] = [];
      const page = mockPage({ mouse: { click: async (x: number, y: number) => { clicks.push({ x, y }); } } });
      page.screenshot = async () => shot;
      // In-page prep reports a 400×300 JPEG: Jev saw half-size pixels.
      page.evaluate = (async (_fn: unknown, arg: unknown) =>
        (arg as { sels?: unknown[] } | undefined)?.sels
          ? { w: 400, h: 300, b64: "AAAA", bounds: (arg as { sels: unknown[] }).sels.map(() => null) }
          : []) as Page["evaluate"];
      const ask = scriptedAsk([
        decide("click", {
          target_click: { choice: "unlabeled", confidence: 0.9 },
          locate_visible: { noul: 0.9 },
          locate: { box: { top: 0.4, bottom: 0.6, left: 0.2, right: 0.4 } },
        }),
        decide("done"),
      ]);
      const r = await runJevLoop(page, { goal: "x", ask, screenshot: true, verifyRecheckMs: 0 });
      expect(clicks).toEqual([{ x: 240, y: 300 }]);
      expect(r.trace![0].locate?.point).toEqual({ x: 240, y: 300 });
    });
  });

  it("given debugDir without screenshot mode, when the run ends, then it writes per-step shots and an escaped report while Jev never sees the image", async () => {
    await withShot(async (dir, shot) => {
      const fs = await import("node:fs");
      const page = mockPage({ snapshot: async () => SNAP.replace('"Search"', '"<img src=x onerror=alert(1)>"') });
      page.screenshot = async () => shot;
      page.evaluate = (async (_fn: unknown, arg: unknown) =>
        (arg as { sels?: unknown[] } | undefined)?.sels
          ? { w: 800, h: 600, b64: null, bounds: [null, { x: 200, y: 260, w: 80, h: 40 }] }
          : []) as Page["evaluate"];
      const seen: unknown[] = [];
      const answers = [decide("click", { target_click: { choice: "5", confidence: 0.9, probabilities: { "5": 0.9, none: 0.1 } } }), decide("done")];
      let n = 0;
      const ask: Ask = async (state, _q, assets) => {
        seen.push(state.screenshot, assets, state.elements.map((e) => (e as { pos?: string }).pos));
        return answers[Math.min(n++, 1)]!;
      };
      const r = await runJevLoop(page, { goal: "x", ask, debugDir: `${dir}/dbg`, verifyRecheckMs: 0 });
      expect(r.status).toBe("done");
      expect(seen.filter(Boolean).flat().filter(Boolean)).toEqual([]);
      expect(r.report).toBe(`${dir}/dbg/report.html`);
      expect(fs.existsSync(`${dir}/dbg/step-01.png`)).toBe(true);
      const req = JSON.parse(fs.readFileSync(`${dir}/dbg/step-01.request.json`, "utf8"));
      expect(req.state.goal).toBe("x");
      expect(req.questions.op.type).toBe("choice");
      expect(req.assets).toEqual({});
      const html = fs.readFileSync(r.report!, "utf8");
      expect(html).toContain("done — goal achieved");
      expect(html).not.toContain("http-equiv=\"refresh\"");
      expect(html).toContain('class="target"');
      expect(html).toContain('href="step-01.request.json"');
      expect(html).not.toContain("<img src=x");
    });
  });
});

describe("runJevLoop low-confidence click with a locate box", () => {
  const run = async (locateConfidence: number) => {
    const fs = await import("node:fs");
    const dir = fs.mkdtempSync("/tmp/ego-jev-lowconf-");
    const shot = `${dir}/shot.png`;
    fs.writeFileSync(shot, fs.readFileSync(new URL("./fixture-800x600.png", import.meta.url)));
    const mouse: { x: number; y: number }[] = [];
    const refs: string[] = [];
    const page = mockPage({
      click: async (sel: string) => { refs.push(sel); },
      mouse: { click: async (x: number, y: number) => { mouse.push({ x, y }); } },
    });
    page.screenshot = async () => shot;
    page.evaluate = (async (_fn: unknown, arg: unknown) =>
      (arg as { sels?: unknown[] } | undefined)?.sels
        ? { w: 800, h: 600, b64: null, bounds: [null, { x: 20, y: 20, w: 60, h: 20 }] }
        : []) as Page["evaluate"];
    const ask = scriptedAsk([
      decide("click", {
        target_click: { choice: "5", confidence: 0.1 },
        locate_visible: { noul: 0.9 },
        locate: { box: { top: 0.4, bottom: 0.6, left: 0.2, right: 0.4 }, confidence: locateConfidence },
      }),
      decide("done"),
    ]);
    try {
      const r = await runJevLoop(page, { goal: "x", ask, screenshot: true, verifyRecheckMs: 0 });
      return { r, mouse, refs };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it("given a shaky id pick but a confident box off that element, when deciding, then it clicks the box point and never the shaky ref", async () => {
    const { r, mouse, refs } = await run(0.9);
    expect(r.status).toBe("done");
    expect(mouse).toEqual([{ x: 240, y: 300 }]);
    expect(refs).toEqual([]);
  });

  it("given a shaky id pick and a weak box, when deciding, then it still escalates on low target confidence", async () => {
    const { r, mouse, refs } = await run(0.3);
    expect(r.status).toBe("escalate");
    expect(r.reason).toMatch(/low target confidence/);
    expect([...mouse, ...refs]).toEqual([]);
  });
});

describe("runJevLoop locate box vs an explicit click id", () => {
  const run = async (snap: string, bounds: unknown[]) => {
    const fs = await import("node:fs");
    const dir = fs.mkdtempSync("/tmp/ego-jev-explicit-");
    const shot = `${dir}/shot.png`;
    fs.writeFileSync(shot, fs.readFileSync(new URL("./fixture-800x600.png", import.meta.url)));
    const refs: string[] = [];
    const page = mockPage({ snapshot: async () => snap, click: async (sel: string) => { refs.push(sel); } });
    page.screenshot = async () => shot;
    page.evaluate = (async (_fn: unknown, arg: unknown) =>
      (arg as { sels?: unknown[] } | undefined)?.sels ? { w: 800, h: 600, b64: null, bounds } : []) as Page["evaluate"];
    const ask = scriptedAsk([
      decide("click", {
        target_click: { choice: "5", confidence: 0.6 },
        locate_visible: { noul: 0.9 },
        locate: { box: { top: 0.4, bottom: 0.6, left: 0.2, right: 0.4 }, confidence: 0.8 },
      }),
      decide("done"),
    ]);
    try {
      await runJevLoop(page, { goal: "x", ask, screenshot: true, verifyRecheckMs: 0 });
      return refs;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it("given Jev picks the search button but the box sits on the filled field, when clicking, then it clicks the button Jev chose", async () => {
    // Google: box = textbox @2 (240,300 inside), Jev's pick = button @5 elsewhere.
    expect(await run(SNAP, [{ x: 200, y: 260, w: 200, h: 80 }, { x: 500, y: 400, w: 80, h: 30 }])).toEqual(["@5"]);
  });

  it("given the box lands on another element with the same name, when clicking, then it re-points to that one", async () => {
    const snap = `root
  button [ref=3]
    text "Edit"
  button [ref=5]
    text "Edit"`;
    expect(await run(snap, [{ x: 200, y: 260, w: 80, h: 80 }, { x: 500, y: 400, w: 80, h: 30 }])).toEqual(["@3"]);
  });
});
