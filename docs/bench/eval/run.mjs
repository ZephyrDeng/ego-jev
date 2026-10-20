// Replay recorded decision points against the real Jev, no browser needed:
//   node docs/bench/eval/run.mjs [runs-per-case=3] [case-name...]
// Each run drives the real runJevLoop (screenshot mode) over a Page replayed
// from cases/<name>/page.json. Steps before the last replay the recorded
// `prior` answers; the last step asks the real Jev and its action is scored
// against case.json `expect`. Exits 1 when any case hits fewer than
// ceil(2/3 of runs) — Jev is stochastic, one miss in three is noise.
// Needs TYPESAFE_API_KEY (env or ~/.config/ego-jev/secrets.env); costs one
// Jev call per run. EGO_JEV_SKILL=<dir> tests another skill copy.
const HERE = new URL(".", import.meta.url).pathname;
const fs = await import("node:fs/promises");
const skill = process.env.EGO_JEV_SKILL || `${HERE}../../../skills/ego-jev`;
const { runJevLoop, preflightJev, makeAsk } = await import(`file://${skill}/scripts/jev-loop.ts`);
const { replayPage, matches } = await import(`file://${HERE}replay.mjs`);

const [runsArg, ...names] = process.argv.slice(2);
const runs = Number(runsArg) || 3;
const ready = await preflightJev({ backend: "typesafe" });
if (!ready.ok) { console.error(ready.reason); process.exit(2); }

const cases = (await fs.readdir(`${HERE}cases`)).filter((n) => !names.length || names.includes(n)).sort();
const need = Math.ceil((runs * 2) / 3);
let failed = 0;
for (const name of cases) {
  const dir = `${HERE}cases/${name}`;
  const c = JSON.parse(await fs.readFile(`${dir}/case.json`, "utf8"));
  if (!c.expect?.length) { console.log(`${name.padEnd(16)} SKIP  no expect in case.json`); continue; }
  let hits = 0;
  const seen = [];
  for (let i = 0; i < runs; i++) {
    const { page, actions } = await replayPage(dir);
    // Recorded answers drive the scripted steps; the scored last step is real Jev.
    const prior = c.prior ?? [];
    const jev = makeAsk({ backend: "typesafe" });
    let k = 0;
    const ask = async (s, q, assets) => (k < prior.length ? prior[k++] : jev(s, q, assets));
    const r = await runJevLoop(page, {
      goal: c.goal, values: c.values, ask,
      screenshot: true, maxSteps: prior.length + 1, verifyRecheckMs: 0,
    });
    const a = actions.find((x) => x.step === prior.length + 1);
    const ok = c.expect.some((e) => matches(e, a));
    if (ok) hits++;
    seen.push(ok ? "✓" : `✗ ${a ? JSON.stringify(a) : `${r.status}: ${r.reason}`}`);
  }
  const pass = hits >= need;
  if (!pass) failed++;
  console.log(`${name.padEnd(16)} ${pass ? "PASS" : "FAIL"}  ${hits}/${runs}`);
  for (const s of seen) if (s !== "✓") console.log(`  ${s.slice(0, 160)}`);
}
process.exit(failed ? 1 : 0);
