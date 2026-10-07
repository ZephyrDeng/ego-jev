import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(process.env.HOME + "/.config/ego-jev/secrets.env", "utf8").split("\n").map(l => l.replace(/^export /, "").match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const snap = fs.readFileSync("docs/bench/snapshot.txt", "utf8");
const goal = "Fill the pizza order: customer name 'Zephyr Test', telephone 5551234567, e-mail zephyr@example.com, choose Medium size, add Bacon topping, then submit the order";
const prompt = `Goal: ${goal}\nAlready done: nothing.\nPage snapshot:\n${snap}\nReply with ONLY a JSON object {"op":"fill|click|select","ref":<number>,"value":<string or null>} for the single next action.`;
const models = process.argv.slice(2);
for (const model of models) {
  const times = [], toks = []; let sample = "";
  for (let i = 0; i < 7; i++) {
    const t0 = Date.now();
    const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.AI_GATEWAY_API_KEY}` }, body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 200 }) });
    const j = await r.json(); times.push(Date.now() - t0);
    if (!r.ok) { console.log(model, "ERR", r.status, JSON.stringify(j).slice(0, 200)); break; }
    toks.push(j.usage?.prompt_tokens); sample = j.choices?.[0]?.message?.content?.slice(0, 80);
  }
  times.sort((a, b) => a - b);
  console.log(model, { n: times.length, minMs: times[0], medianMs: times[Math.floor(times.length / 2)], maxMs: times.at(-1), promptTokens: toks[0], sample });
}
