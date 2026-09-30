// Exercise the real makeAsk/runJevLoop backend path with synthetic credentials
// and intercepted fetch only. HOME is isolated from the user's configuration.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { askGateway, askTypeSafe, makeAsk, preflightJev, runJevLoop } from "./jev-loop.ts";
import type { Answers, Ask, BackendOptions, Page } from "./jev-loop.ts";

const state = { goal: "Search", url: "https://example.test/", elements: [], values: {}, history: [] };
const questions = { done: { type: "noul" as const, instructions: "Is the goal done?" } };
const done: Answers = { op: { choice: "done", confidence: 0.9 }, done: { noul: 0.9 } };
const directResponse = () => Response.json({ answers: done });
const gatewayResponse = () => Response.json({ answers: {
  op: { type: "choice", choice: "done", probabilities: { done: 0.9 } },
  done: { type: "boolean", probability: 0.9 },
} });

function mockPage() {
  const methods = {
    snapshot: vi.fn(async () => 'root\n  button [ref=5, loc=css:button.go]\n    text "Search"'),
    evaluate: vi.fn(async () => [] as never),
    url: vi.fn(async () => "https://example.test/"),
    click: vi.fn(async () => {}), fill: vi.fn(async () => {}),
    hover: vi.fn(async () => {}), selectOption: vi.fn(async () => {}),
    waitForTimeout: vi.fn(async (_ms: number) => {}),
    cdp: vi.fn(async () => ({})), events: vi.fn(async () => []),
  };
  const mouseClick = vi.fn(async () => {});
  const insertText = vi.fn(async () => {});
  return {
    page: { ...methods, mouse: { click: mouseClick }, keyboard: { insertText } } satisfies Page,
    spies: [...Object.values(methods), mouseClick, insertText],
  };
}

let configHome: string;
let network: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  configHome = mkdtempSync(join(tmpdir(), "ego-jev-backend-"));
  vi.stubEnv("HOME", configHome);
  vi.stubEnv("TYPESAFE_API_KEY", undefined);
  vi.stubEnv("AI_GATEWAY_API_KEY", undefined);
  network = vi.fn<typeof fetch>(async () => { throw new Error("unexpected network request"); });
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(configHome, { recursive: true, force: true });
});

describe("credential failures in the real backend path", () => {
  it.each([undefined, "auto", "typesafe", "gateway"] as const)(
    "missing credentials with backend=%s fail before any page or recording activity", async (backend) => {
      const { page, spies } = mockPage();
      const result = await runJevLoop(page, { goal: "Search", backend, record: true });
      expect(result.status).toBe("escalate");
      expect(result.reason).toContain("~/.config/ego-jev/secrets.env");
      expect(result.reason).toContain("preflightJev");
      expect(result.steps).toBe(0);
      expect(result.timings.steps).toEqual([]);
      expect(result.timings.llmCalls).toEqual([]);
      expect(result.timings.llmMs).toBe(0);
      expect(result.trace).toEqual([]);
      expect(result.record).toBeUndefined();
      expect(network).not.toHaveBeenCalled();
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    },
  );

  it("makeAsk gives actionable configuration guidance without sending a request", async () => {
    await expect(makeAsk()(state, questions)).rejects.toThrow("~/.config/ego-jev/secrets.env");
    expect(network).not.toHaveBeenCalled();
  });

  it.each([askTypeSafe, askGateway])("a direct backend function fails safely before fetch", async (ask) => {
    await expect(ask(state, questions)).rejects.toMatchObject({ code: "JEV_MISSING_CREDENTIALS" });
    expect(network).not.toHaveBeenCalled();
  });

  it.each(["", "   "])("an explicit blank key fails without using ambient credentials (%j)", async (apiKey) => {
    vi.stubEnv("TYPESAFE_API_KEY", "synthetic-ambient");
    const { page, spies } = mockPage();
    const result = await runJevLoop(page, { goal: "Search", apiKey });
    expect(result.status).toBe("escalate");
    expect(result.timings.llmCalls).toEqual([]);
    expect(network).not.toHaveBeenCalled();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("safe preflight before TaskSpace creation", () => {
  it("reports missing configuration without network or browser calls", async () => {
    const taskSpace = vi.fn(async () => { throw new Error("TaskSpace must not be created"); });
    vi.stubGlobal("taskSpace", taskSpace);
    const ready = await preflightJev();
    expect(ready).toMatchObject({ ok: false, backend: "gateway" });
    expect(ready.ok ? "" : ready.reason).toContain("~/.config/ego-jev/secrets.env");
    expect(taskSpace).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    { opts: {}, env: "TYPESAFE_API_KEY", backend: "typesafe" },
    { opts: {}, env: "AI_GATEWAY_API_KEY", backend: "gateway" },
    { opts: { backend: "gateway" as const }, env: "TYPESAFE_API_KEY", backend: "gateway" },
    { opts: { backend: "typesafe" as const, apiKey: "synthetic-explicit" }, env: "AI_GATEWAY_API_KEY", backend: "typesafe" },
  ])("preflight resolves $backend and exposes only readiness/route", async ({ opts, env, backend }) => {
    vi.stubEnv(env, "synthetic-env-preflight");
    const taskSpace = vi.fn();
    vi.stubGlobal("taskSpace", taskSpace);
    const ready = await preflightJev(opts);
    expect(ready).toEqual({ ok: true, backend });
    expect(JSON.stringify(ready)).not.toContain("synthetic");
    expect(network).not.toHaveBeenCalled();
    expect(taskSpace).not.toHaveBeenCalled();
  });

  it("makeAsk's preflight and request use the same privately resolved configuration", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "synthetic-resolved");
    const ask = makeAsk();
    expect(await ask.preflight?.()).toEqual({ ok: true, backend: "typesafe" });
    expect(network).not.toHaveBeenCalled();
    vi.stubEnv("TYPESAFE_API_KEY", undefined);
    network.mockResolvedValue(directResponse());
    await ask(state, questions);
    expect(network.mock.calls[0][1]?.headers).toMatchObject({ authorization: "Bearer synthetic-resolved" });
  });

  it("custom ask needs no key, and preflight never invokes its decision function", async () => {
    const ask = vi.fn(async () => done);
    expect(await preflightJev({ ask })).toEqual({ ok: true, backend: "custom" });
    expect(ask).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("an injected ask can refuse configuration through its own preflight hook", async () => {
    const ask: Ask = vi.fn(async () => done);
    ask.preflight = vi.fn(async () => ({ ok: false as const, backend: "custom" as const, reason: "Configure the custom decider" }));
    const { page, spies } = mockPage();
    const result = await runJevLoop(page, { goal: "Search", ask });
    expect(result).toMatchObject({ status: "escalate", reason: "Configure the custom decider", steps: 0 });
    expect(result.timings.llmCalls).toEqual([]);
    expect(ask.preflight).toHaveBeenCalledOnce();
    expect(ask).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("a supplied makeAsk still runs its own credential preflight", async () => {
    const { page, spies } = mockPage();
    const ask = makeAsk({ backend: "typesafe" });
    expect(await preflightJev({ ask })).toMatchObject({ ok: false, backend: "typesafe" });
    const result = await runJevLoop(page, { goal: "Search", ask, keepTrace: false });
    expect(result.status).toBe("escalate");
    expect(result.steps).toBe(0);
    expect(result.trace).toBeUndefined();
    expect(result.timings.llmCalls).toEqual([]);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });
});

describe("backend selection and credentials", () => {
  it.each([
    { env: "TYPESAFE_API_KEY", backend: "typesafe", endpoint: "/v1/systemone" },
    { env: "AI_GATEWAY_API_KEY", backend: "gateway", endpoint: "/v4/ai/evaluation-model" },
  ])("auto resolves $env through makeAsk/runJevLoop", async ({ env, backend, endpoint }) => {
    vi.stubEnv(env, "synthetic-env-key");
    network.mockImplementation(backend === "typesafe" ? async () => directResponse() : async () => gatewayResponse());
    const { page } = mockPage();
    const result = await runJevLoop(page, { goal: "Search" });
    expect(result.status).toBe("done");
    expect(result.timings.llmCalls[0].backend).toBe(backend);
    expect(network).toHaveBeenCalledOnce();
    expect(String(network.mock.calls[0][0])).toContain(endpoint);
    expect(network.mock.calls[0][1]?.headers).toMatchObject({ authorization: "Bearer synthetic-env-key" });
    expect(result.record).toBeUndefined();
    expect(page.cdp).not.toHaveBeenCalled();
    expect(page.events).not.toHaveBeenCalled();
  });

  it.each([
    { backend: "typesafe", endpoint: "/v1/systemone" },
    { backend: "gateway", endpoint: "/v4/ai/evaluation-model" },
  ] as const)("explicit apiKey/backend=$backend overrides ambient keys", async ({ backend, endpoint }) => {
    vi.stubEnv("TYPESAFE_API_KEY", "synthetic-ambient-direct");
    vi.stubEnv("AI_GATEWAY_API_KEY", "synthetic-ambient-gateway");
    network.mockResolvedValue(backend === "typesafe" ? directResponse() : gatewayResponse());
    const ask = makeAsk({ backend, apiKey: "synthetic-explicit", baseUrl: "https://direct.example.test", gatewayBaseUrl: "https://gateway.example.test" });
    await ask(state, questions);
    expect(String(network.mock.calls[0][0])).toBe(`https://${backend === "typesafe" ? "direct" : "gateway"}.example.test${endpoint}`);
    expect(network.mock.calls[0][1]?.headers).toMatchObject({ authorization: "Bearer synthetic-explicit" });
    expect(ask.describe?.().backend).toBe(backend);
  });

  it("auto with only an explicit apiKey prefers direct TypeSafe", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "synthetic-ambient-gateway");
    network.mockResolvedValue(directResponse());
    const ask = makeAsk({ apiKey: "synthetic-explicit-direct" });
    await ask(state, questions);
    expect(String(network.mock.calls[0][0])).toContain("api.typesafe.ai/v1/systemone");
    expect(network.mock.calls[0][1]?.headers).toMatchObject({ authorization: "Bearer synthetic-explicit-direct" });
  });

  it.each(["typesafe", "gateway"] as const)("an explicit %s backend keeps its route", async (backend) => {
    vi.stubEnv("TYPESAFE_API_KEY", "synthetic-direct");
    vi.stubEnv("AI_GATEWAY_API_KEY", "synthetic-gateway");
    network.mockResolvedValue(backend === "typesafe" ? directResponse() : gatewayResponse());
    const result = await runJevLoop(mockPage().page, { goal: "Search", backend });
    expect(result.status).toBe("done");
    expect(result.timings.llmCalls[0].backend).toBe(backend);
  });

  it("an explicit TypeSafe backend without its key fails even when a gateway key exists", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "synthetic-gateway-only");
    const { page, spies } = mockPage();
    const result = await runJevLoop(page, { goal: "Search", backend: "typesafe" });
    expect(result.status).toBe("escalate");
    expect(result.reason).toContain("TYPESAFE_API_KEY");
    expect(network).not.toHaveBeenCalled();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it.each([401, 403])("auto retains the %s auth fallback and caches the gateway route", async (status) => {
    vi.stubEnv("TYPESAFE_API_KEY", "synthetic-misfiled-gateway");
    network.mockResolvedValueOnce(new Response("unauthorized", { status }))
      .mockImplementation(async () => gatewayResponse());
    const ask = makeAsk();
    await ask(state, questions);
    await ask(state, questions);
    expect(network.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.typesafe.ai/v1/systemone",
      "https://ai-gateway.vercel.sh/v4/ai/evaluation-model",
      "https://ai-gateway.vercel.sh/v4/ai/evaluation-model",
    ]);
    expect(network.mock.calls[1][1]?.headers).toMatchObject({ authorization: "Bearer synthetic-misfiled-gateway" });
  });

  it("auth fallback prefers a separately configured gateway key", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "synthetic-direct");
    vi.stubEnv("AI_GATEWAY_API_KEY", "synthetic-gateway");
    network.mockResolvedValueOnce(new Response("unauthorized", { status: 401 })).mockResolvedValueOnce(gatewayResponse());
    await makeAsk()(state, questions);
    expect(network.mock.calls[1][1]?.headers).toMatchObject({ authorization: "Bearer synthetic-gateway" });
  });

  it("an explicit TypeSafe route does not fall back on auth failure", async () => {
    network.mockResolvedValue(new Response("unauthorized", { status: 401 }));
    await expect(makeAsk({ backend: "typesafe", apiKey: "synthetic-key" })(state, questions)).rejects.toThrow("systemone 401");
    expect(network).toHaveBeenCalledOnce();
  });

  it.each([".config/ego-jev/secrets.env", ".zshenv", ".zshrc"])("resolves a synthetic key from %s", async (file) => {
    const path = join(configHome, file);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, 'export TYPESAFE_API_KEY="synthetic-file-key"\n');
    network.mockResolvedValue(directResponse());
    const result = await runJevLoop(mockPage().page, { goal: "Search" });
    expect(result.status).toBe("done");
    expect(network.mock.calls[0][1]?.headers).toMatchObject({ authorization: "Bearer synthetic-file-key" });
  });

  it("keeps key-name priority over file priority for the gateway fallback", async () => {
    mkdirSync(join(configHome, ".config/ego-jev"), { recursive: true });
    writeFileSync(join(configHome, ".config/ego-jev/secrets.env"), "TYPESAFE_API_KEY=synthetic-fallback\n");
    writeFileSync(join(configHome, ".zshrc"), "export AI_GATEWAY_API_KEY=synthetic-preferred\n");
    network.mockResolvedValue(gatewayResponse());
    await makeAsk({ backend: "gateway" })(state, questions);
    expect(network.mock.calls[0][1]?.headers).toMatchObject({ authorization: "Bearer synthetic-preferred" });
  });

  it("uses a current-runtime key before a file key", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "synthetic-env-priority");
    writeFileSync(join(configHome, ".zshenv"), "TYPESAFE_API_KEY=synthetic-file\n");
    network.mockResolvedValue(directResponse());
    await makeAsk()(state, questions);
    expect(network.mock.calls[0][1]?.headers).toMatchObject({ authorization: "Bearer synthetic-env-priority" });
  });

  it("custom ask runs without a backend key or network", async () => {
    const ask: Ask = vi.fn(async () => done);
    const result = await runJevLoop(mockPage().page, { goal: "Search", ask });
    expect(result.status).toBe("done");
    expect(result.timings.llmCalls[0].model).toBe("custom");
    expect(ask).toHaveBeenCalledOnce();
    expect(network).not.toHaveBeenCalled();
  });
});

describe("transient failure retries", () => {
  it.each(["503", "timeout", "connection"])("a real makeAsk %s failure retries once after 800ms", async (failure) => {
    const opts: BackendOptions = { backend: "gateway", apiKey: "synthetic-key" };
    if (failure === "503") network.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    else network.mockRejectedValueOnce(failure === "timeout" ? new DOMException("timeout", "TimeoutError") : new TypeError("fetch failed"));
    network.mockImplementation(async () => gatewayResponse());
    const { page } = mockPage();
    const result = await runJevLoop(page, { goal: "Search", ...opts });
    expect(result.status).toBe("done");
    expect(network).toHaveBeenCalledTimes(2);
    expect(page.waitForTimeout).toHaveBeenCalledExactlyOnceWith(800);
    expect(result.timings.llmCalls.map((call) => [call.kind, call.ok])).toEqual([["decide", false], ["decide-retry", true]]);
  });

  it("two transient failures still stop after the bounded retry", async () => {
    network.mockImplementation(async () => new Response("unavailable", { status: 503 }));
    const { page } = mockPage();
    const result = await runJevLoop(page, { goal: "Search", backend: "gateway", apiKey: "synthetic-key" });
    expect(result.status).toBe("escalate");
    expect(result.reason).toContain("gateway evaluation 503");
    expect(network).toHaveBeenCalledTimes(2);
    expect(page.waitForTimeout).toHaveBeenCalledExactlyOnceWith(800);
    expect(result.timings.llmCalls).toHaveLength(2);
    expect(page.click).not.toHaveBeenCalled();
  });
});
