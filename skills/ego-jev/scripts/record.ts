// record.ts — opt-in network + cookie recorder for runJevLoop (options.record).
// Uses CDP Network events drained through page.events(). Raw page.cdp() calls
// invalidate snapshot refs, so cdp only runs at start (before the first
// snapshot) and at stop (after the last action); per-step draining is ref-safe.

import type { CdpEvent, RecordPage } from "./types.ts";

export interface RecordOptions {
  network?: boolean;
  cookies?: boolean;
  headers?: boolean;
  bodies?: boolean;
  cookieValues?: boolean;
  resourceTypes?: string[] | null;
  redactQuery?: RegExp | string[];
  maxEntries?: number;
  maxBodyBytes?: number;
  maxBodies?: number;
  dir?: string | null;
}

export type RecordConfig = Required<Omit<RecordOptions, "redactQuery">> & { redactQuery: RegExp };

export interface CookieMeta {
  name: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  size?: number;
  valueHash: string;
  value?: string;
}

export interface NetworkEntry {
  id: string;
  step: number;
  type: string;
  method: string;
  url: string;
  at: number;
  status?: number;
  mime?: string;
  cached?: boolean;
  ms?: number;
  bytes?: number;
  done?: boolean;
  failed?: string;
  redirectTo?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  _ts?: number;
}

export interface CookieDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

export interface RecordResult {
  network: NetworkEntry[];
  cookies?: { before?: CookieMeta[]; after?: CookieMeta[]; diff?: CookieDiff };
  dropped?: number;
  errors?: string[];
  refsInvalidated?: boolean;
  file?: string;
}

export interface Recorder {
  start(): Promise<void>;
  drain(step: number): Promise<void>;
  stop(step: number): Promise<RecordResult>;
}

export const RECORD_DEFAULTS: RecordConfig = {
  network: true,
  cookies: true,
  headers: false,
  bodies: false,
  cookieValues: false,
  resourceTypes: ["Document", "XHR", "Fetch"],
  redactQuery: /token|key|sig|auth|secret|passw|session|code|csrf|jwt/i,
  maxEntries: 500,
  maxBodyBytes: 4096,
  maxBodies: 20,
  dir: null,
};

const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-.*(token|key|secret|auth|csrf).*)$/i;

export function normalizeRecord(record?: boolean | RecordOptions): RecordConfig | null {
  if (!record) return null;
  const { redactQuery, ...rest } = record === true ? ({} as RecordOptions) : record;
  return {
    ...RECORD_DEFAULTS,
    ...rest,
    redactQuery: Array.isArray(redactQuery)
      ? new RegExp(redactQuery.join("|"), "i")
      : redactQuery ?? RECORD_DEFAULTS.redactQuery,
  };
}

const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
};

export function redactUrl(url: string, re: RegExp): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (re.test(k)) u.searchParams.set(k, "[redacted]");
    return u.toString();
  } catch {
    return url;
  }
}

const redactHeaders = (h: Record<string, string> = {}) =>
  Object.fromEntries(Object.entries(h).map(([k, v]) => [k, SENSITIVE_HEADER.test(k) ? "[redacted]" : v]));

const errMsg = (e: unknown) => String((e as Error)?.message || e);

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…[+${s.length - n}]` : s);

export function cookieMeta(c: any, withValue: boolean): CookieMeta {
  const m: CookieMeta = {
    name: c.name, domain: c.domain, path: c.path,
    expires: c.expires > 0 ? c.expires : undefined,
    httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite,
    size: c.size, valueHash: fnv(String(c.value ?? "")),
  };
  if (withValue) m.value = c.value;
  return m;
}

const ckey = (c: CookieMeta) => `${c.domain}|${c.path}|${c.name}`;

export function diffCookies(before: CookieMeta[] = [], after: CookieMeta[] = []): CookieDiff {
  const b = new Map(before.map((c) => [ckey(c), c]));
  const a = new Map(after.map((c) => [ckey(c), c]));
  return {
    added: after.filter((c) => !b.has(ckey(c))).map(ckey),
    removed: before.filter((c) => !a.has(ckey(c))).map(ckey),
    changed: after.filter((c) => b.has(ckey(c)) && b.get(ckey(c))!.valueHash !== c.valueHash).map(ckey),
  };
}

export function createRecorder(page: RecordPage, cfg: RecordConfig): Recorder {
  const pending = new Map<string, NetworkEntry>(); // requestId -> entry
  const network: NetworkEntry[] = [];
  const state = { dropped: 0, t0: Date.now(), cdpUsed: false, cookies: {} as NonNullable<RecordResult["cookies"]> };

  const push = (entry: NetworkEntry) => {
    network.push(entry);
    if (network.length > cfg.maxEntries) {
      network.shift();
      state.dropped++;
    }
  };

  const cookiesNow = async (): Promise<CookieMeta[]> => {
    const url = await page.url();
    if (!/^https?:/.test(url)) return [];
    const { cookies } = await page.cdp("Network.getCookies", { urls: [url] });
    return cookies.map((c: unknown) => cookieMeta(c, cfg.cookieValues));
  };

  const onEvent = ({ method, params: p }: CdpEvent, step: number) => {
    if (method === "Network.requestWillBeSent") {
      const url = p.request.url;
      if (!/^https?:/.test(url)) return;
      if (cfg.resourceTypes && !cfg.resourceTypes.includes(p.type)) return;
      const prev = pending.get(p.requestId);
      if (prev && p.redirectResponse) {
        prev.status = p.redirectResponse.status;
        prev.redirectTo = redactUrl(url, cfg.redactQuery);
        pending.delete(p.requestId);
      }
      const entry: NetworkEntry = {
        id: p.requestId, step, type: p.type, method: p.request.method,
        url: redactUrl(url, cfg.redactQuery),
        at: p.wallTime ? Math.round(p.wallTime * 1000) : Date.now(), _ts: p.timestamp,
      };
      if (cfg.headers) entry.requestHeaders = redactHeaders(p.request.headers);
      if (cfg.bodies && p.request.postData) entry.requestBody = clip(p.request.postData, cfg.maxBodyBytes);
      pending.set(p.requestId, entry);
      push(entry);
    } else if (method === "Network.responseReceived") {
      const e = pending.get(p.requestId);
      if (!e) return;
      e.status = p.response.status;
      e.mime = p.response.mimeType;
      if (p.response.fromDiskCache || p.response.fromServiceWorker) e.cached = true;
      if (cfg.headers) e.responseHeaders = redactHeaders(p.response.headers);
    } else if (method === "Network.loadingFinished") {
      const e = pending.get(p.requestId);
      if (!e) return;
      e.ms = Math.round((p.timestamp - (e._ts ?? p.timestamp)) * 1000);
      e.bytes = p.encodedDataLength;
      e.done = true;
    } else if (method === "Network.loadingFailed") {
      const e = pending.get(p.requestId);
      if (!e) return;
      e.failed = p.errorText;
      e.done = true;
    }
  };

  return {
    // Before the first snapshot: enable Network, clear stale events, take the "before" cookie jar.
    async start(): Promise<void> {
      if (cfg.network) {
        await page.cdp("Network.enable");
        state.cdpUsed = true;
        await page.events();
      }
      if (cfg.cookies) {
        state.cdpUsed = true;
        state.cookies.before = await cookiesNow();
      }
    },
    // Ref-safe: events() is not a CDP command. `step` = the step whose action caused these events.
    async drain(step: number): Promise<void> {
      if (!cfg.network) return;
      for (const ev of await page.events()) onEvent(ev, step);
    },
    // After the last action: final drain, optional bodies, "after" cookies, Network.disable.
    // Returns the record object; `refsInvalidated` tells the caller to re-snapshot.
    async stop(step: number): Promise<RecordResult> {
      const errors: string[] = [];
      const guard = async (label: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { errors.push(`${label}: ${errMsg(e).slice(0, 100)}`); } };
      await guard("drain", () => this.drain(step));
      if (cfg.network && cfg.bodies) {
        await guard("bodies", async () => {
          const targets = network.filter((e) => e.done && !e.failed && ["XHR", "Fetch"].includes(e.type)).slice(-cfg.maxBodies);
          for (const e of targets) {
            try {
              const b = await page.cdp("Network.getResponseBody", { requestId: e.id });
              if (!b.base64Encoded) e.responseBody = clip(String(b.body), cfg.maxBodyBytes);
            } catch {}
          }
        });
      }
      if (cfg.cookies) {
        await guard("cookies", async () => {
          state.cookies.after = await cookiesNow();
          state.cookies.diff = diffCookies(state.cookies.before, state.cookies.after);
        });
      }
      if (cfg.network) await guard("disable", () => page.cdp("Network.disable"));
      for (const e of network) delete e._ts;
      const out: RecordResult = {
        network,
        cookies: cfg.cookies ? state.cookies : undefined,
        dropped: state.dropped || undefined,
        errors: errors.length ? errors : undefined,
        refsInvalidated: state.cdpUsed,
      };
      const dir = cfg.dir;
      if (dir) await guard("write", async () => { out.file = await writeRecord(dir, out, state.t0); });
      return out;
    },
  };
}

async function writeRecord(dir: string, rec: RecordResult, t0: number): Promise<string> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `jev-${new Date(t0).toISOString().replace(/[:.]/g, "-")}.jsonl`);
  const lines = [
    ...rec.network.map((e) => ({ kind: "request", ...e })),
    ...(rec.cookies ? [{ kind: "cookies", ...rec.cookies }] : []),
  ].map((l) => JSON.stringify(l));
  await fs.writeFile(file, lines.join("\n") + "\n", { mode: 0o600 });
  return file;
}

// Compact per-step view of result.record for printing to the user / agent.
export function formatRecord(result?: { record?: RecordResult }): string {
  const r = result?.record;
  if (!r) return "jev record: not enabled";
  const out = [`jev record · ${r.network.length} requests${r.dropped ? ` (+${r.dropped} dropped)` : ""}${r.file ? ` · ${r.file}` : ""}`];
  const steps = [...new Set(r.network.map((e) => e.step))];
  for (const s of steps) {
    out.push(`  step ${s}`);
    for (const e of r.network.filter((x) => x.step === s)) {
      out.push(`    ${e.method} ${e.status ?? (e.failed ? "ERR" : "…")} ${e.type} ${clip(e.url, 100)}${e.ms != null ? ` ${e.ms}ms` : ""}`);
    }
  }
  const d = r.cookies?.diff;
  if (r.cookies) {
    out.push(`  cookies ${r.cookies.before?.length ?? "?"} -> ${r.cookies.after?.length ?? "?"}` +
      (d ? ` (+${d.added.length} -${d.removed.length} ~${d.changed.length})` : ""));
    for (const k of d?.added ?? []) out.push(`    + ${k}`);
    for (const k of d?.removed ?? []) out.push(`    - ${k}`);
    for (const k of d?.changed ?? []) out.push(`    ~ ${k}`);
  }
  if (r.errors) out.push(`  errors: ${r.errors.join("; ")}`);
  return out.join("\n");
}
