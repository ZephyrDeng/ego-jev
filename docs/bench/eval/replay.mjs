// Shared by capture.mjs and run.mjs: name each in-page evaluate call by the
// shape of its argument, and rebuild a Page that answers from a recording.
// If jev-loop.ts changes an evaluate argument shape, update evaluateKind and
// recapture.

// dom = collectDomInteractives, prep = screenshot downscale + bounds,
// selects = native <select> option labels. Anything else (scroll) is an action.
export function evaluateKind(arg) {
  if (arg && typeof arg === "object" && "selectors" in arg) return "dom";
  if (arg && typeof arg === "object" && "sels" in arg) return "prep";
  if (Array.isArray(arg)) return "selects";
  return null;
}

// Replays observations step by step: a snapshot after an action moves to the
// next recorded step. Actions are recorded, not performed, tagged with the
// step they happened in.
export async function replayPage(dir) {
  const fs = await import("node:fs/promises");
  const rec = JSON.parse(await fs.readFile(`${dir}/page.json`, "utf8"));
  for (const s of rec.steps) {
    if (s.evaluate.prep?.b64?.startsWith("file:")) {
      s.evaluate.prep.b64 = (await fs.readFile(`${dir}/${s.evaluate.prep.b64.slice(5)}`)).toString("base64");
    }
  }
  const actions = [];
  let i = -1, acted = true;
  const cur = () => rec.steps[Math.max(0, Math.min(i, rec.steps.length - 1))];
  const act = (a) => { actions.push({ ...a, step: i + 1 }); acted = true; };
  const page = {
    snapshot: async () => { if (acted) { i++; acted = false; } return cur().snapshot; },
    url: async () => cur().url,
    screenshot: async () => `${dir}/${cur().shot}`,
    evaluate: async (_fn, arg) => {
      const kind = evaluateKind(arg);
      if (kind) return cur().evaluate[kind] ?? (kind === "prep" ? null : []);
      act({ type: "evaluate" });
    },
    click: async (sel) => act({ type: "click", sel }),
    fill: async (sel, value) => act({ type: "fill", sel, value }),
    hover: async (sel) => act({ type: "hover", sel }),
    selectOption: async (sel, value) => act({ type: "select", sel, value }),
    mouse: { click: async (x, y) => act({ type: "mouse", x, y }) },
    keyboard: { insertText: async () => {} },
    waitForTimeout: async () => {},
    cdp: async () => ({}), events: async () => [],
  };
  return { page, actions, steps: rec.steps.length };
}

// An expectation matches an action when every field given matches; `in` is a
// CSS-px rect the mouse point must fall inside.
export function matches(exp, a) {
  if (!a || exp.type !== a.type) return false;
  if (exp.sel != null && exp.sel !== a.sel) return false;
  if (exp.in) {
    const r = exp.in;
    if (!(a.x >= r.x && a.x <= r.x + r.w && a.y >= r.y && a.y <= r.y + r.h)) return false;
  }
  return true;
}
