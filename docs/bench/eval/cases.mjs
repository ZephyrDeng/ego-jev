// Eval cases: each is one Jev decision point. `setup` runs plain ego calls to
// reach that point; `script` answers earlier loop steps so the scored step
// carries real loop history. Add a case whenever a real page exposes a decision bug.
const canvasPage = `<!doctype html><html><body style="font-family:sans-serif;padding:24px;margin:0">
  <button>Real DOM button</button>
  <div style="margin-top:16px"><canvas id="cv" width="400" height="80" style="border:1px solid #ccc"></canvas></div>
  <script>const cv=document.getElementById("cv"),c=cv.getContext("2d");c.fillStyle="#10b981";c.fillRect(20,18,160,44);c.fillStyle="#fff";c.font="bold 15px sans-serif";c.fillText("Fire Torpedo",45,46);</script>
</body></html>`;
const editRows = `<!doctype html><html><body style="font-family:sans-serif;padding:24px">
  <h3>People</h3>
  <div><span>Alice</span><button>Edit</button></div>
  <div><span>Bob</span><button>Edit</button></div>
  <div><span>Carol</span><button>Edit</button></div>
</body></html>`;
const query = { query: { value: "TypeSafe Jev latest model", hint: "Google search query" } };
const googleGoal = "用 google 搜索 jev 最新模型的介绍";

export const CASES = [
  {
    name: "canvas-torpedo",
    note: "canvas-drawn button next to a real DOM button; the click must land on the drawn button",
    url: "data:text/html;charset=utf-8," + encodeURIComponent(canvasPage),
    goal: "Click the 'Fire Torpedo' button drawn on the canvas",
  },
  {
    name: "edit-carol",
    note: "three same-named Edit buttons; only Carol's is right",
    url: "data:text/html;charset=utf-8," + encodeURIComponent(editRows),
    goal: "Click the Edit button next to Carol",
  },
  {
    name: "google-home",
    note: "empty Google home: fill the query into the search box",
    url: "https://www.google.com/",
    goal: googleGoal, values: query,
  },
  {
    name: "google-filled",
    note: "v0.5.0 bug: the locate box sat on the filled field and hijacked the search-button click",
    url: "https://www.google.com/",
    goal: googleGoal, values: query,
    // Step 1 is scripted (fill the search box) so step 2 sees Jev's own
    // "fill … ok" history, exactly as in the live run.
    script: [
      (state) => {
        const box = state.elements.find((e) => /combobox/.test(e.role) && e.name === "搜索");
        return {
          op: { choice: "fill", confidence: 1 },
          target_fill: { choice: String(box.id), confidence: 1 },
          done: { noul: 0 }, stuck: { noul: 0 },
        };
      },
    ],
  },
];
