// record.test.ts — BDD specs for the opt-in network/cookie recorder.
// Pure Node: the page is a fake with cdp() and events(). Run: npx vitest run

import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CdpEvent } from "./types.ts";
import type { RecordOptions } from "./record.ts";
import {
  RECORD_DEFAULTS,
  normalizeRecord,
  redactUrl,
  cookieMeta,
  diffCookies,
  createRecorder,
  formatRecord,
} from "./record.ts";

const ev = (method: string, params: object): CdpEvent => ({ method, params });
const req = (id: string, url: string, type = "XHR", extra: object = {}) =>
  ev("Network.requestWillBeSent", {
    requestId: id, type, timestamp: 1, wallTime: 1700000000,
    request: { url, method: "GET", headers: {} }, ...extra,
  });
const resp = (id: string, status = 200, extra: object = {}) =>
  ev("Network.responseReceived", { requestId: id, response: { status, mimeType: "text/plain", headers: {}, ...extra } });
const fin = (id: string, t = 1.1) => ev("Network.loadingFinished", { requestId: id, timestamp: t, encodedDataLength: 7 });

const fakePage = ({ url = "https://a.test/", batches = [], cookies = [] }: { url?: string; batches?: CdpEvent[][]; cookies?: any[] } = {}) => {
  const calls: { method: string; params?: any }[] = [];
  let b = 0;
  return {
    calls,
    url: async () => url,
    events: async () => batches[b++] ?? [],
    cdp: async (method: string, params?: any) => {
      calls.push({ method, params });
      if (method === "Network.getCookies") return { cookies };
      if (method === "Network.getResponseBody") return { body: "hello", base64Encoded: false };
      return {};
    },
  };
};
const rec = (page: ReturnType<typeof fakePage>, cfg: boolean | RecordOptions = true) => createRecorder(page, normalizeRecord(cfg)!);

describe("normalizeRecord", () => {
  it("given a falsy value, then recording stays off", () => {
    expect(normalizeRecord(undefined)).toBeNull();
    expect(normalizeRecord(false)).toBeNull();
  });

  it("given true, then the safe defaults apply: metadata only, no headers, bodies or cookie values", () => {
    const cfg = normalizeRecord(true)!;
    expect(cfg).toMatchObject({ network: true, cookies: true, headers: false, bodies: false, cookieValues: false, dir: null });
    expect(cfg.resourceTypes).toEqual(["Document", "XHR", "Fetch"]);
  });

  it("given an object, then it overrides only the knobs it names", () => {
    expect(normalizeRecord({ headers: true })).toMatchObject({ headers: true, cookies: true, maxEntries: RECORD_DEFAULTS.maxEntries });
  });

  it("given redactQuery as a string array, then it becomes a case-insensitive RegExp", () => {
    const { redactQuery } = normalizeRecord({ redactQuery: ["foo", "bar"] })!;
    expect(redactQuery.test("FOO")).toBe(true);
    expect(redactQuery.test("baz")).toBe(false);
  });
});

describe("redactUrl", () => {
  const re = RECORD_DEFAULTS.redactQuery;

  it("given sensitive query params, then only their values are replaced", () => {
    const u = redactUrl("https://a.test/p?q=1&access_token=xyz&Session=s", re);
    expect(u).toContain("q=1");
    expect(u).not.toContain("xyz");
    expect(u).not.toContain("=s&");
    expect(new URL(u).searchParams.get("access_token")).toBe("[redacted]");
    expect(new URL(u).searchParams.get("Session")).toBe("[redacted]");
  });

  it("given a URL without a query, then it is unchanged apart from normalisation", () => {
    expect(redactUrl("https://a.test/p", re)).toBe("https://a.test/p");
  });

  it("given an unparseable URL, then it is returned as-is instead of throwing", () => {
    expect(redactUrl("not a url", re)).toBe("not a url");
  });
});

describe("cookieMeta and diffCookies", () => {
  const c = (name: string, value: string, extra: object = {}) => cookieMeta({ name, value, domain: "a.test", path: "/", size: 5, ...extra }, false);

  it("given a cookie, when values are off, then the value is absent and replaced by a stable hash", () => {
    const m = c("sid", "secret");
    expect(m.value).toBeUndefined();
    expect(JSON.stringify(m)).not.toContain("secret");
    expect(m.valueHash).toBe(c("sid", "secret").valueHash);
    expect(m.valueHash).not.toBe(c("sid", "other").valueHash);
  });

  it("given a session cookie (expires -1), then expires is omitted", () => {
    expect(c("s", "v", { expires: -1 }).expires).toBeUndefined();
    expect(c("s", "v", { expires: 1900000000 }).expires).toBe(1900000000);
  });

  it("given values on, then the value is kept", () => {
    expect(cookieMeta({ name: "n", value: "v", domain: "d", path: "/" }, true).value).toBe("v");
  });

  it("given before and after jars, then diff lists added, removed and changed keys", () => {
    const before = [c("keep", "1"), c("gone", "1"), c("edit", "1")];
    const after = [c("keep", "1"), c("edit", "2"), c("new", "1")];
    expect(diffCookies(before, after)).toEqual({
      added: ["a.test|/|new"], removed: ["a.test|/|gone"], changed: ["a.test|/|edit"],
    });
  });

  it("given the same cookie name on different paths, then they are distinct keys", () => {
    const d = diffCookies([], [c("n", "1"), cookieMeta({ name: "n", value: "1", domain: "a.test", path: "/x" }, false)]);
    expect(d.added).toHaveLength(2);
  });
});

describe("createRecorder network capture", () => {
  it("given start(), then Network.enable runs first and stale buffered events are discarded", async () => {
    const page = fakePage({ batches: [[req("stale", "https://a.test/old")], []] });
    const r = rec(page, { cookies: false });
    await r.start();
    const out = await r.stop(0);
    expect(page.calls[0].method).toBe("Network.enable");
    expect(out.network).toEqual([]);
  });

  it("given a request that spans two drains, then request, response and finish merge into one entry keeping the first step", async () => {
    const page = fakePage({ batches: [[], [req("a", "https://a.test/api")], [resp("a", 201), fin("a", 1.25)]] });
    const r = rec(page, { cookies: false });
    await r.start();
    await r.drain(1);
    await r.drain(2);
    const { network } = await r.stop(2);
    expect(network).toHaveLength(1);
    expect(network[0]).toMatchObject({ step: 1, status: 201, ms: 250, bytes: 7, mime: "text/plain", done: true });
    expect(network[0]._ts).toBeUndefined();
  });

  it("given a redirect, then the hop is closed with its status and the follow-up is a new entry", async () => {
    const redirect = req("a", "https://a.test/final", "Document", { redirectResponse: { status: 302 } });
    const page = fakePage({ batches: [[], [req("a", "https://a.test/old", "Document"), redirect]] });
    const r = rec(page, { cookies: false });
    await r.start();
    const { network } = await r.stop(1);
    expect(network.map((e) => [e.url, e.status, e.redirectTo])).toEqual([
      ["https://a.test/old", 302, "https://a.test/final"],
      ["https://a.test/final", undefined, undefined],
    ]);
  });

  it("given a failed request, then it is marked failed and done", async () => {
    const page = fakePage({ batches: [[], [req("a", "https://a.test/x"), ev("Network.loadingFailed", { requestId: "a", errorText: "net::ERR_FAILED" })]] });
    const r = rec(page, { cookies: false });
    await r.start();
    const { network } = await r.stop(1);
    expect(network[0]).toMatchObject({ failed: "net::ERR_FAILED", done: true });
  });

  it("given a cached response, then cached is flagged", async () => {
    const page = fakePage({ batches: [[], [req("a", "https://a.test/x"), resp("a", 200, { fromDiskCache: true })]] });
    const r = rec(page, { cookies: false });
    await r.start();
    expect((await r.stop(1)).network[0].cached).toBe(true);
  });

  it("given responses for requests that were filtered out, then they are ignored without error", async () => {
    const page = fakePage({ batches: [[], [req("img", "https://a.test/x.png", "Image"), resp("img"), fin("img")]] });
    const r = rec(page, { cookies: false });
    await r.start();
    const out = await r.stop(1);
    expect(out.network).toEqual([]);
    expect(out.errors).toBeUndefined();
  });

  it("given resourceTypes:null, then all http(s) types are kept but non-http schemes are still dropped", async () => {
    const page = fakePage({ batches: [[], [
      req("a", "https://a.test/x.png", "Image"),
      req("b", "chrome-extension://x/y.js", "Script"),
      req("c", "data:text/plain,hi", "Other"),
      req("d", "http://a.test/s.css", "Stylesheet"),
    ]] });
    const r = rec(page, { cookies: false, resourceTypes: null });
    await r.start();
    expect((await r.stop(1)).network.map((e) => e.id)).toEqual(["a", "d"]);
  });

  it("given headers:true, then names matching auth/cookie/x-*token are redacted and case is ignored", async () => {
    const headers = { AUTHORIZATION: "Bearer x", Cookie: "a=b", "X-Api-Token": "t", "X-CSRF-Key": "k", "Content-Type": "json" };
    const page = fakePage({ batches: [[], [req("a", "https://a.test/x", "XHR", { request: { url: "https://a.test/x", method: "POST", headers } })]] });
    const r = rec(page, { cookies: false, headers: true });
    await r.start();
    const [e] = (await r.stop(1)).network;
    expect(e.requestHeaders).toEqual({
      AUTHORIZATION: "[redacted]", Cookie: "[redacted]", "X-Api-Token": "[redacted]", "X-CSRF-Key": "[redacted]", "Content-Type": "json",
    });
  });

  it("given bodies:true, then post data is captured and capped, and base64 or failing bodies are skipped", async () => {
    const big = "x".repeat(50);
    const page = fakePage({ batches: [[], [
      req("a", "https://a.test/a", "XHR", { request: { url: "https://a.test/a", method: "POST", headers: {}, postData: big } }),
      fin("a"),
      req("b", "https://a.test/b"), fin("b"),
      req("c", "https://a.test/c"), fin("c"),
    ]] });
    page.cdp = async (method: string, params?: any) => {
      page.calls.push({ method, params });
      if (method === "Network.getResponseBody") {
        if (params.requestId === "a") return { body: big, base64Encoded: false };
        if (params.requestId === "b") return { body: "AAAA", base64Encoded: true };
        throw new Error("No resource with given identifier");
      }
      return { cookies: [] };
    };
    const r = rec(page, { cookies: false, bodies: true, maxBodyBytes: 10 });
    await r.start();
    const { network, errors } = await r.stop(1);
    const by = Object.fromEntries(network.map((e) => [e.id, e]));
    expect(by.a.requestBody).toBe("xxxxxxxxxx…[+40]");
    expect(by.a.responseBody).toBe("xxxxxxxxxx…[+40]");
    expect(by.b.responseBody).toBeUndefined();
    expect(by.c.responseBody).toBeUndefined();
    expect(errors).toBeUndefined();
  });

  it("given bodies:false, then getResponseBody is never called", async () => {
    const page = fakePage({ batches: [[], [req("a", "https://a.test/a"), fin("a")]] });
    const r = rec(page, { cookies: false });
    await r.start();
    await r.stop(1);
    expect(page.calls.map((c) => c.method)).not.toContain("Network.getResponseBody");
  });

  it("given more finished XHRs than maxBodies, then only the most recent are fetched", async () => {
    const evs = ["1", "2", "3"].flatMap((i) => [req(i, `https://a.test/${i}`), fin(i)]);
    const page = fakePage({ batches: [[], evs] });
    const r = rec(page, { cookies: false, bodies: true, maxBodies: 2 });
    await r.start();
    await r.stop(1);
    expect(page.calls.filter((c) => c.method === "Network.getResponseBody").map((c) => c.params.requestId)).toEqual(["2", "3"]);
  });
});

describe("createRecorder cookies", () => {
  it("given an https page, then cookies are read scoped to its URL", async () => {
    const page = fakePage({ url: "https://a.test/p" });
    const r = rec(page, { network: false });
    await r.start();
    const get = page.calls.find((c) => c.method === "Network.getCookies");
    expect(get!.params).toEqual({ urls: ["https://a.test/p"] });
    expect(page.calls.map((c) => c.method)).not.toContain("Network.getAllCookies");
  });

  it("given about:blank, then no cookie CDP call is made and the jar is empty", async () => {
    const page = fakePage({ url: "about:blank" });
    const r = rec(page, { network: false });
    await r.start();
    const out = await r.stop(0);
    expect(page.calls.map((c) => c.method)).not.toContain("Network.getCookies");
    expect(out.cookies!.before).toEqual([]);
  });

  it("given network:false, then Network.enable/disable and events() are never used", async () => {
    const page = fakePage();
    let eventsCalled = false;
    page.events = async () => { eventsCalled = true; return []; };
    const r = rec(page, { network: false });
    await r.start();
    await r.drain(1);
    await r.stop(1);
    expect(eventsCalled).toBe(false);
    expect(page.calls.map((c) => c.method)).toEqual(["Network.getCookies", "Network.getCookies"]);
  });

  it("given cookies:false, then result.cookies is undefined", async () => {
    const page = fakePage();
    const r = rec(page, { cookies: false });
    await r.start();
    expect((await r.stop(0)).cookies).toBeUndefined();
  });

  it("given both features off, then no CDP call is made and refs are not invalidated", async () => {
    const page = fakePage();
    const r = rec(page, { network: false, cookies: false });
    await r.start();
    const out = await r.stop(0);
    expect(page.calls).toEqual([]);
    expect(out.refsInvalidated).toBe(false);
  });
});

describe("createRecorder resilience", () => {
  it("given getCookies failing at stop, then the error is reported and the rest of the record survives", async () => {
    const page = fakePage({ batches: [[], [req("a", "https://a.test/a")]] });
    let n = 0;
    const orig = page.cdp;
    page.cdp = async (m, p) => {
      if (m === "Network.getCookies" && ++n === 2) throw new Error("boom");
      return orig(m, p);
    };
    const r = rec(page);
    await r.start();
    const out = await r.stop(1);
    expect(out.network).toHaveLength(1);
    expect(out.errors![0]).toContain("cookies: boom");
    expect(page.calls.at(-1)!.method).toBe("Network.disable");
  });

  it("given a ring buffer overflow, then dropped counts every evicted entry", async () => {
    const evs = Array.from({ length: 5 }, (_, i) => req(`r${i}`, `https://a.test/${i}`));
    const page = fakePage({ batches: [[], evs] });
    const r = rec(page, { cookies: false, maxEntries: 3 });
    await r.start();
    const out = await r.stop(1);
    expect(out.network.map((e) => e.id)).toEqual(["r2", "r3", "r4"]);
    expect(out.dropped).toBe(2);
  });
});

describe("createRecorder dir persistence", () => {
  it("given dir, then a private JSONL file holds request lines and one cookies line", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "jev-rec-")), "nested");
    const page = fakePage({ batches: [[], [req("a", "https://a.test/a?token=zzz")]], cookies: [{ name: "sid", value: "v", domain: "a.test", path: "/" }] });
    const r = rec(page, { dir });
    await r.start();
    const out = await r.stop(1);

    const lines = (await readFile(out.file!, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.kind)).toEqual(["request", "cookies"]);
    expect(lines[0].url).not.toContain("zzz");
    expect(lines[1].after[0].value).toBeUndefined();
    expect((await stat(out.file!)).mode & 0o777).toBe(0o600);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
  });

  it("given no dir, then nothing is written and file is undefined", async () => {
    const page = fakePage();
    const r = rec(page);
    await r.start();
    expect((await r.stop(0)).file).toBeUndefined();
  });
});

describe("formatRecord", () => {
  it("given a result without record, then it says recording was not enabled", () => {
    expect(formatRecord({})).toBe("jev record: not enabled");
    expect(formatRecord(undefined)).toBe("jev record: not enabled");
  });

  it("given a record, then requests are grouped by step and cookie changes are listed", () => {
    const record = {
      network: [
        { step: 1, method: "GET", status: 200, type: "XHR", url: "https://a.test/api", ms: 30 },
        { step: 2, method: "POST", failed: "net::ERR", type: "Fetch", url: "https://a.test/save" },
        { step: 2, method: "GET", type: "Document", url: "https://a.test/pending" },
      ],
      cookies: { before: [1], after: [1, 2], diff: { added: ["a|/|sid"], removed: ["a|/|old"], changed: ["a|/|x"] } },
      dropped: 4,
      errors: ["cookies: boom"],
    };
    const out = formatRecord({ record: record as any });
    expect(out).toContain("3 requests (+4 dropped)");
    expect(out).toMatch(/step 1\n\s+GET 200 XHR https:\/\/a\.test\/api 30ms/);
    expect(out).toMatch(/step 2\n\s+POST ERR Fetch/);
    expect(out).toContain("GET … Document");
    expect(out).toContain("cookies 1 -> 2 (+1 -1 ~1)");
    expect(out).toContain("+ a|/|sid");
    expect(out).toContain("- a|/|old");
    expect(out).toContain("~ a|/|x");
    expect(out).toContain("errors: cookies: boom");
  });

  it("given a long URL, then it is clipped", () => {
    const url = "https://a.test/" + "p".repeat(300);
    const out = formatRecord({ record: { network: [{ step: 1, method: "GET", status: 200, type: "XHR", url }] } as any });
    expect(out).toContain("…");
    expect(out.length).toBeLessThan(url.length);
  });
});
