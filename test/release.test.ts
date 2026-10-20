// Release invariants checked on every test run: the three version fields the
// skills CLI, Claude plugin and marketplace each read must agree.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("release metadata", () => {
  it("SKILL.md, plugin.json and marketplace.json carry the same version", () => {
    const skill = read("skills/ego-jev/SKILL.md").match(/^\s+version:\s*"([^"]+)"/m)?.[1];
    const plugin = JSON.parse(read(".claude-plugin/plugin.json")).version;
    const market = JSON.parse(read(".claude-plugin/marketplace.json")).plugins
      .find((p: { name: string }) => p.name === "ego-jev")?.version;
    expect(skill).toMatch(/^\d+\.\d+\.\d+$/);
    expect({ plugin, market }).toEqual({ plugin: skill, market: skill });
  });
});
