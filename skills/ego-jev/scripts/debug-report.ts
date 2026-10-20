// debug-report.ts — opt-in visual decision log for runJevLoop (options.debugDir).
// Writes step-NN.png (the raw viewport screenshot) plus report.html, which
// overlays every candidate's bounds, the chosen target, Jev's locate box and
// the click point on each shot, next to every question's answer and
// probabilities. Rewritten after each step and auto-refreshing until the run
// ends, so opening it mid-run shows decisions as they happen. Each step also
// gets step-NN.request.json: the exact state + questions sent to Jev, with
// image assets pointing at files, so a misbehaving step can be replayed.
import type { Answer, Answers, AskAssets, StepTiming, TraceEntry } from "./jev-loop.ts";

type Rect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

export interface DebugStep {
  step: number;
  url: string;
  shot?: string;
  request?: string;
  view?: { w: number; h: number };
  answers: Answers;
  entry: TraceEntry;
  candidates: { ref: number | string; role: string; name?: string; bounds?: Rect }[];
  target?: { ref: number | string | null; bounds?: Rect; point?: Pt | null };
  timing: StepTiming;
}

export interface DebugFinal {
  status: string;
  reason: string;
}

// Page text is untrusted: everything rendered goes through esc().
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const num = (n?: number) => (n == null ? "–" : n.toFixed(2));

function figure(s: DebugStep): string {
  if (!s.shot || !s.view) return `<div class="noshot">no screenshot (page.screenshot unavailable)</div>`;
  const { w, h } = s.view;
  const box = (cls: string, l: number, t: number, bw: number, bh: number, label: string, title = "") =>
    `<div class="${cls}" title="${esc(title)}" style="left:${pct(l)};top:${pct(t)};width:${pct(bw)};height:${pct(bh)}"><span>${esc(label)}</span></div>`;
  const rect = (cls: string, r: Rect, label: string, title = "") => box(cls, r.x / w, r.y / h, r.w / w, r.h / h, label, title);
  const parts = s.candidates
    .filter((c) => c.bounds && c.bounds.w > 0 && c.bounds.h > 0)
    .map((c) => rect("cand", c.bounds!, String(c.ref), `${c.ref} ${c.role} ${c.name ?? ""}`));
  const b = s.answers.locate?.box;
  if (b) parts.push(box("locate", b.left, b.top, b.right - b.left, b.bottom - b.top, `locate ${num(s.answers.locate?.confidence)}`));
  if (s.target?.bounds) parts.push(rect("target", s.target.bounds, `target @${s.target.ref}`));
  const p = s.target?.point ?? s.entry.locate?.point;
  if (p) parts.push(`<div class="pt" style="left:${pct(p.x / w)};top:${pct(p.y / h)}"></div>`);
  return `<div class="fig"><img src="${esc(s.shot)}" alt="step ${s.step}">${parts.join("")}</div>`;
}

function answer(key: string, a: Answer): string {
  let head = "";
  if (a.choice != null) head = `<b>${esc(a.choice)}</b> conf ${num(a.confidence)}`;
  else if (a.noul != null) head = `<span class="bar"><i style="width:${pct(a.noul)}"></i></span> ${num(a.noul)}`;
  else if (a.box) head = `box l${num(a.box.left)} t${num(a.box.top)} r${num(a.box.right)} b${num(a.box.bottom)} conf ${num(a.confidence)}`;
  const probs = Object.entries(a.probabilities ?? {})
    .sort((x, y) => y[1] - x[1])
    .slice(0, 5)
    .map(([k, v]) => `<div class="p"><span class="bar"><i style="width:${pct(v)}"></i></span>${num(v)} ${esc(k)}</div>`)
    .join("");
  return `<tr><th>${esc(key)}</th><td>${head}${probs}</td></tr>`;
}

function stepHtml(s: DebugStep): string {
  const e = s.entry;
  const order = ["op", "target_click", "target_fill", "target_select", "target_scroll", "locate", "locate_visible", "done", "stuck"];
  const keys = Object.keys(s.answers).sort((x, y) => (order.indexOf(x) + 1 || 99) - (order.indexOf(y) + 1 || 99));
  const action = [
    e.op && `op <b>${esc(e.op)}</b> (${num(e.opConfidence)})`,
    e.ref != null && `ref <b>@${esc(e.ref)}</b> ${esc(e.name)}`,
    e.valueKey && `value <b>${esc(e.valueKey)}</b>`,
    e.retried && `retried → ${esc(e.retried)}`,
    s.request && `<a href="${esc(s.request)}">request</a>`,
  ].filter(Boolean).join(" · ");
  const t = s.timing;
  const timing = (["snapshotMs", "domMs", "shotMs", "askMs", "actMs", "verifyMs", "stepMs"] as const)
    .filter((k) => t[k] != null).map((k) => `${k.replace("Ms", "")} ${t[k]}ms`).join(" · ");
  return `<section><h2>Step ${s.step} <small>${esc(s.url)}</small></h2>
<p class="act">${action || "no action"}</p><p class="tm">${timing}</p>
<div class="row">${figure(s)}<table>${keys.map((k) => answer(k, s.answers[k]!)).join("")}</table></div></section>`;
}

export function renderDebugReport(goal: string, steps: DebugStep[], final?: DebugFinal): string {
  const banner = final
    ? `<p class="final ${esc(final.status)}">${esc(final.status)} — ${esc(final.reason)}</p>`
    : `<p class="final running">running… (auto-refresh 2s)</p>`;
  return `<!doctype html><html><head><meta charset="utf-8">${final ? "" : `<meta http-equiv="refresh" content="2">`}
<title>jev · ${esc(goal)}</title><style>
body{font:13px/1.4 system-ui,sans-serif;margin:16px;background:#fafafa;color:#222}
h1{font-size:16px}h2{font-size:14px;margin:0}h2 small{color:#888;font-weight:400}
section{background:#fff;border:1px solid #ddd;border-radius:6px;padding:10px;margin:12px 0}
.row{display:flex;gap:12px;align-items:flex-start}.act{margin:4px 0}.tm{margin:0 0 6px;color:#888}
.fig{position:relative;flex:0 0 auto;width:min(720px,60vw);line-height:0}.fig img{width:100%;border:1px solid #ccc}
.fig div{position:absolute;box-sizing:border-box;line-height:1.2}.fig span{position:absolute;top:-14px;left:0;font-size:10px;padding:0 2px;white-space:nowrap}
.cand{border:1px solid rgba(59,130,246,.45)}.cand span{display:none;background:rgba(59,130,246,.85);color:#fff}.cand:hover span{display:block}
.target{border:3px solid #16a34a}.target span{background:#16a34a;color:#fff}
.locate{border:2px dashed #dc2626}.locate span{background:#dc2626;color:#fff;top:auto;bottom:-14px}
.pt{width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#dc2626;border:2px solid #fff;box-shadow:0 0 0 1px #dc2626}
table{border-collapse:collapse;font-size:12px}th{text-align:left;padding:3px 8px 3px 0;vertical-align:top;color:#555;white-space:nowrap}td{padding:3px 0}
.bar{display:inline-block;width:80px;height:8px;background:#eee;margin-right:6px;vertical-align:middle}.bar i{display:block;height:100%;background:#6366f1}
.p{color:#555}.noshot{width:240px;color:#999;padding:20px;border:1px dashed #ccc;line-height:1.4}
.final{padding:6px 10px;border-radius:4px;font-weight:600}.done{background:#dcfce7}.running{background:#e0e7ff}.escalate,.blocked,.max_steps{background:#fee2e2}
</style></head><body><h1>${esc(goal)}</h1>${banner}${steps.map(stepHtml).join("")}</body></html>`;
}

// Image bytes go to files, not the JSON, so the dump stays readable and
// diffable. An unscaled PNG asset is the raw capture, so it reuses step-NN.png.
export async function writeStepArtifacts(
  dir: string, step: number,
  req: { state: unknown; questions: unknown; assets?: AskAssets },
  png?: Uint8Array | null,
): Promise<{ shot?: string; request?: string }> {
  const fs = await import("node:fs/promises");
  const tag = `step-${String(step).padStart(2, "0")}`;
  const out: { shot?: string; request?: string } = {};
  if (png) { await fs.writeFile(`${dir}/${tag}.png`, png); out.shot = `${tag}.png`; }
  const assets: Record<string, { type: "image"; format: string; file: string }> = {};
  for (const [ref, a] of Object.entries(req.assets ?? {})) {
    const reuse = a.image.format === "png" && out.shot;
    const file = reuse ? out.shot! : `${tag}.sent.${a.image.format}`;
    if (!reuse) await fs.writeFile(`${dir}/${file}`, Buffer.from(a.image.data_base64, "base64"));
    assets[ref] = { type: "image", format: a.image.format, file };
  }
  await fs.writeFile(`${dir}/${tag}.request.json`, JSON.stringify({ state: req.state, questions: req.questions, assets }, null, 1));
  out.request = `${tag}.request.json`;
  return out;
}

export async function writeDebugReport(dir: string, goal: string, steps: DebugStep[], final?: DebugFinal): Promise<string> {
  const [fs, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  const file = path.join(dir, "report.html");
  await fs.writeFile(file, renderDebugReport(goal, steps, final));
  return file;
}
