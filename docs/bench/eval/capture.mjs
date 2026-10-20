// Record eval fixtures: one Jev decision point per case. Runs inside ego lite:
//   ego-browser nodejs -e "await import('file://$PWD/docs/bench/eval/capture.mjs')"
// Optionally set globalThis.EVAL_ONLY = "<case>" in the -e string first.
// For each case it opens the page, runs `setup` with plain ego calls, then
// runs runJevLoop through a recording Page. The case's `script` answers the
// earlier steps (they act on the real page, so Jev's history is real); the
// last step gets a stub "escalate" so nothing more is clicked. Every step's
// observations — snapshot, url, in-page evaluate results, screenshot — go to
// cases/<name>/, which run.mjs replays against the real Jev.
// case.json keeps a hand-written `expect`; recapturing preserves it, but refs
// may shift, so re-check `expect` against the new page.json.
const HERE = new URL(".", import.meta.url).pathname;
const fs = await import("node:fs/promises");
const { runJevLoop } = await import(`file://${HERE}../../../skills/ego-jev/scripts/jev-loop.ts`);
const { evaluateKind } = await import(`file://${HERE}replay.mjs`);
const { CASES } = await import(`file://${HERE}cases.mjs`);

const only = globalThis.EVAL_ONLY;
const task = await taskSpace("ego-jev eval capture");
console.log({ spaceId: task.spaceId });
const page = task.page("p1");
try {
  for (const c of CASES.filter((x) => !only || x.name === only)) {
    const dir = `${HERE}cases/${c.name}`;
    await fs.mkdir(dir, { recursive: true });
    const prev = await fs.readFile(`${dir}/case.json`, "utf8").then(JSON.parse).catch(() => ({}));
    for (const f of await fs.readdir(dir)) if (f !== "case.json") await fs.rm(`${dir}/${f}`);
    await page.goto(c.url, { waitUntil: "domcontentloaded" });
    if (c.setup) await c.setup(page);
    const steps = [];
    let acted = true;
    const step = () => steps.at(-1);
    const did = (fn) => async (...a) => { acted = true; return fn(...a); };
    const recording = {
      snapshot: async (o) => {
        if (acted) { steps.push({ url: "", snapshot: "", evaluate: {} }); acted = false; }
        return (step().snapshot = await page.snapshot(o));
      },
      url: async () => (step().url = await page.url()),
      evaluate: async (fn, arg) => {
        const r = await page.evaluate(fn, arg);
        const kind = evaluateKind(arg);
        if (kind) step().evaluate[kind] = r; else acted = true;
        return r;
      },
      screenshot: async (o) => {
        const p = await page.screenshot(o);
        step().shot = `step-${steps.length}.png`;
        await fs.copyFile(p, `${dir}/${step().shot}`);
        return p;
      },
      waitForTimeout: (ms) => page.waitForTimeout(ms),
      click: did((s, o) => page.click(s, o)),
      fill: did((s, v) => page.fill(s, v)),
      hover: did((s, o) => page.hover(s, o)),
      selectOption: did((s, v) => page.selectOption(s, v)),
      mouse: { click: did((x, y, o) => page.mouse.click(x, y, o)) },
      keyboard: { insertText: did((t) => page.keyboard.insertText(t)) },
      cdp: () => page.cdp(), events: () => page.events(),
    };
    const script = c.script ?? [];
    const prior = [];
    let n = 0;
    await runJevLoop(recording, {
      goal: c.goal, values: c.values, screenshot: true, maxSteps: script.length + 1,
      ask: async (state, questions) => {
        if (n < script.length) { const a = script[n++](state, questions); prior.push(a); return a; }
        return { op: { choice: "escalate", confidence: 1 } };
      },
    });
    // A downscaled screenshot comes back as JPEG base64: keep it out of the JSON.
    for (const [k, s] of steps.entries()) {
      if (s.evaluate.prep?.b64) {
        await fs.writeFile(`${dir}/step-${k + 1}.sent.jpg`, Buffer.from(s.evaluate.prep.b64, "base64"));
        s.evaluate.prep.b64 = `file:step-${k + 1}.sent.jpg`;
      }
    }
    // Fixtures are public: drop session-bound query values (Google's setprefs
    // `sig` is tied to the browser's cookie). Jev sees the same page shape.
    const redacted = JSON.stringify({ steps }, null, 1)
      .replace(/([?&](?:sig|sxsrf|token|usg|ei|ved|iflsig)=)[^&"\\\s]+/gi, "$1redacted");
    await fs.writeFile(`${dir}/page.json`, redacted);
    await fs.writeFile(`${dir}/case.json`, JSON.stringify({
      goal: c.goal, values: c.values, note: c.note, prior, expect: prev.expect ?? [],
    }, null, 1));
    console.log(`captured ${c.name}: ${steps.length} step(s), ${prior.length} scripted`);
  }
} finally {
  await task.finish({ keep: [] });
}
