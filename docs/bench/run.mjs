// ego runs scripts in / without the shell env: locate the repo from this file.
const REPO = new URL("../..", import.meta.url).pathname;
const SKILL_DIR = `${REPO}skills/ego-jev`;
const fs = await import("node:fs/promises");
const { preflightJev, runJevLoop, formatTimings } = await import(`file://${SKILL_DIR}/scripts/jev-loop.ts`);
const ready = await preflightJev({});
console.log({ ...ready });
if (!ready.ok) throw new Error("preflight failed");

const task = await taskSpace("ego-jev benchmark");
console.log({ spaceId: task.spaceId });
const page = task.page("p1");
const goal = "Fill the pizza order: customer name, telephone and e-mail, choose Medium size, add Bacon topping, then submit the order";
const values = {
  name: { value: "Zephyr Test", hint: "customer name" },
  tel: { value: "5551234567", hint: "telephone" },
  email: { value: "zephyr@example.com", hint: "e-mail address" },
};
const runs = [];
for (let i = 0; i < 3; i++) {
  await page.goto("https://httpbin.org/forms/post", { waitUntil: "domcontentloaded" });
  if (i === 0) await fs.writeFile(`${REPO}docs/bench/snapshot.txt`, await page.snapshot());
  const t0 = Date.now();
  const result = await runJevLoop(page, {
    goal, values,
    verify: async (p) => /\/post$/.test(await p.url()),
    planner: process.env.PLANNER || "bench",
  });
  const wall = Date.now() - t0;
  runs.push({ i, status: result.status, verified: result.verified, steps: result.steps, wall, llmMs: result.timings.llmMs, llmCalls: result.timings.llmCalls.length, model: result.timings.model, askMs: result.timings.steps.map(s => s.askMs), stepMs: result.timings.steps.map(s => s.stepMs), usage: result.timings.llmCalls.map(c => c.usage) });
  if (i === 0) console.log(formatTimings(result));
}
await fs.writeFile(`${REPO}docs/bench/runs.json`, JSON.stringify(runs, null, 1));
console.log(JSON.stringify(runs.map(r => ({ ...r, usage: undefined })), null, 1));
await task.finish({ keep: [] });
