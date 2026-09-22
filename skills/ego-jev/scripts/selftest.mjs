// selftest.mjs — offline smoke test for jev-loop.mjs inside ego-browser.
// Run from the skill root: ego-browser nodejs < scripts/selftest.mjs
// (or set EGO_JEV_DIR to the skill root when the runtime's cwd differs).
// Uses a rule-based mock ask — no TYPESAFE_API_KEY needed.

const { pathToFileURL } = await import("node:url");
const { resolve } = await import("node:path");
const skillDir = process.env.EGO_JEV_DIR || process.cwd();
const {
  parseSnapshot,
  buildQuestions,
  runJevLoop,
  formatTimings,
} = await import(pathToFileURL(resolve(skillDir, "scripts/jev-loop.mjs")).href);

const HTTPBIN_SNAP = `[p1 "httpbin.org/forms/post" | space "jev probe"(12): 1 managed, 0 untracked — p1* "httpbin.org/forms/post"]
root
  form
    paragraph
      text "Customer name:"
      textbox [ref=2, loc=css:input[name="custname"]]
    paragraph
      text "Telephone:"
      textbox [ref=3, loc=css:input[name="custtel"]]
    paragraph
      text "E-mail address:"
      textbox [ref=4, loc=css:input[name="custemail"]]
    group [ref=5]
      text "Pizza Size"
      paragraph
        radio [ref=6]
        text "Small"
      paragraph
        radio [ref=7]
        text "Medium"
      paragraph
        radio [ref=8]
        text "Large"
    group [ref=9]
      text "Pizza Toppings"
      paragraph
        checkbox [ref=10]
        text "Bacon"
    paragraph
      button [ref=18]
        text "Submit order"
`;

// --- parser assertions ------------------------------------------------------
const cands = parseSnapshot(HTTPBIN_SNAP);
const byRef = Object.fromEntries(cands.map((c) => [c.ref, c]));
const fails = [];
const eq = (cond, msg) => { if (!cond) fails.push(msg); };

eq(byRef[2]?.name === "Customer name:", `textbox label, got "${byRef[2]?.name}"`);
eq(byRef[6]?.name === "Small", `radio sibling text, got "${byRef[6]?.name}"`);
eq(byRef[6]?.context === "Pizza Size", `group context, got "${byRef[6]?.context}"`);
eq(byRef[10]?.name === "Bacon", `checkbox name, got "${byRef[10]?.name}"`);
eq(byRef[18]?.name === "Submit order", `button child text, got "${byRef[18]?.name}"`);
eq(byRef[5]?.actionable === false, "group not actionable");
eq(byRef[2]?.actionable === true, "textbox actionable");
console.log(`parser: ${fails.length ? "FAIL " + JSON.stringify(fails) : "ok"} (${cands.length} candidates)`);

// --- question shape ---------------------------------------------------------
const qs = buildQuestions(cands, { email: "z@x.com", name: { value: "Zephyr", hint: "customer name" } });
console.log("questions:", Object.keys(qs).join(","), "| target_fill options:", Object.keys(qs.target_fill.criteria).length);

// --- live loop with mock ask ------------------------------------------------
const task = await taskSpace("jev selftest");
const page = task.page("p1");
await page.goto("https://httpbin.org/forms/post");
await page.waitForLoadState();

// Script: fill name, fill email, check Bacon — then done. (No submit: keeps
// assertions on the same page.)
const script = [
  { op: "fill", match: /customer name/i, key: "custname" },
  { op: "fill", match: /e-mail/i, key: "custemail" },
  { op: "click", match: /bacon/i },
  { op: "done" },
];
let cursor = 0;
const mockAsk = async (state) => {
  const step = script[cursor++] || { op: "escalate" };
  const answers = {
    op: { choice: step.op, confidence: 0.9 },
    done: { noul: step.op === "done" ? 0.9 : 0.1 },
    stuck: { noul: 0.01 },
  };
  const hit = step.match && state.elements.find((e) => step.match.test(`${e.name} ${e.in ?? ""}`));
  for (const act of ["click", "fill", "select"]) {
    answers[`target_${act}`] = {
      choice: act === step.op && hit ? String(hit.id) : "none",
      confidence: 0.9,
    };
  }
  if (step.key) answers.value_key = { choice: step.key, confidence: 0.9 };
  return answers;
};

const result = await runJevLoop(page, {
  goal: "Fill customer name and email, check the Bacon topping. Do not submit.",
  values: { custname: "Zephyr Test", custemail: "z@example.com" },
  ask: mockAsk,
});
console.log("loop result:", JSON.stringify({ status: result.status, reason: result.reason, steps: result.steps }));
console.log(formatTimings(result));

// Verify the page actually holds what the loop claims it did.
const check = await page.evaluate(() => ({
  name: document.querySelector('input[name="custname"]')?.value,
  email: document.querySelector('input[name="custemail"]')?.value,
  bacon: [...document.querySelectorAll('input[type="checkbox"]')].find((c) => c.checked)?.value,
}));
console.log("page state:", JSON.stringify(check));
console.log(
  check.name === "Zephyr Test" && check.email === "z@example.com" && /bacon/i.test(check.bacon || "")
    ? "SELFTEST PASS"
    : "SELFTEST FAIL",
);

// --- DOM dark-matter candidate -------------------------------------------------
// A div+cursor:pointer+onclick "card" — no role, no a11y ref. The loop must
// discover it via collectDomInteractives and click it via data-ego-jev.
await page.evaluate(() => {
  const d = document.createElement("div");
  d.id = "fake-card";
  d.style.cssText = "cursor:pointer;padding:12px;background:#ffd";
  d.textContent = "Open member card G18655";
  d.onclick = () => { window.__jevDomClicked = true; };
  document.body.appendChild(d);
});

let c2 = 0;
const domScript = [{ op: "click", match: /G18655/i }, { op: "done" }];
const mockAsk2 = async (state) => {
  const step = domScript[c2] || { op: "escalate" };
  c2++;
  if (c2 === 1) {
    const doms = state.elements.filter((e) => String(e.id).startsWith("d"));
    console.log("dom candidates:", doms.map((e) => `${e.id}:${e.role} "${String(e.name).slice(0, 30)}"`).join(" | "));
  }
  const hit = step.match && state.elements.find((e) => step.match.test(String(e.name)));
  return {
    op: { choice: step.op, confidence: 0.9 },
    done: { noul: step.op === "done" ? 0.9 : 0.1 },
    stuck: { noul: 0.01 },
    target_click: { choice: step.op === "click" && hit ? String(hit.id) : "none", confidence: 0.9 },
    target_fill: { choice: "none", confidence: 0.9 },
    target_select: { choice: "none", confidence: 0.9 },
  };
};
const r2 = await runJevLoop(page, { goal: "Open the member card for G18655", ask: mockAsk2 });
const clicked = await page.evaluate(() => window.__jevDomClicked === true);
console.log("dom loop:", JSON.stringify({ status: r2.status, reason: r2.reason, steps: r2.steps, clicked }));
console.log(clicked && r2.status === "done" ? "DOM SELFTEST PASS" : "DOM SELFTEST FAIL");
