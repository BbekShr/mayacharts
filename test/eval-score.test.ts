import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { countMarks, parseJson, score, summarize } from "../eval/score.ts";
import { render, validateSpec } from "../src/index.ts";

// echarts lives in compare/ (npm ci --prefix compare); without it the echarts cases skip.
const echarts = await import(
  new URL("../compare/node_modules/echarts/index.js", import.meta.url).href
).catch(() => null);
const libs = { validateSpec, render, echarts } as never;
const rows = [
  { region: "North", revenue: 120 },
  { region: "South", revenue: 90 },
  { region: "West", revenue: 150 },
];

describe("parseJson", () => {
  it("accepts an object, with or without a code fence", () => {
    expect(parseJson('{"a":1}').ok).toBe(true);
    expect(parseJson('```json\n{"a":1}\n```').ok).toBe(true);
  });
  it("rejects prose, arrays and null", () => {
    expect(parseJson('Here you go: {"a":1}').ok).toBe(false);
    expect(parseJson("[1]").ok).toBe(false);
    expect(parseJson("null").ok).toBe(false);
  });
});

describe("countMarks", () => {
  const svg = (inner: string) => `<svg width="100" height="50">${inner}</svg>`;
  it("ignores the background, single-segment axes, defs and text", () => {
    expect(
      countMarks(
        svg(
          '<defs><clipPath id="c"><rect width="10" height="10"/></clipPath></defs>' +
            '<rect width="100" height="50"/><path d="M0 0L100 0"/><path d="M0,0H5"/><text>x</text>',
        ),
      ),
    ).toBe(0);
  });
  it("counts bars, polylines and dots", () => {
    expect(countMarks(svg('<rect x="1" width="10" height="20"/>'))).toBe(1);
    expect(countMarks(svg('<path d="M0 0L10 5L20 2"/>'))).toBe(1);
    expect(countMarks(svg('<circle r="2"/><circle r="2"/>'))).toBe(2);
  });
});

describe("score", () => {
  it("scores a good mayaCharts spec as renders and non-blank", () => {
    const s = score("mayacharts", '{"type":"bar","x":"region","y":"revenue"}', rows, libs);
    expect(s).toEqual({ validJson: true, renders: true, nonBlank: true });
  });
  it("scores a bad spec as valid JSON that does not render", () => {
    const s = score("mayacharts", '{"type":"donut","x":"region","y":"revenue"}', rows, libs);
    expect(s.validJson).toBe(true);
    expect(s.renders).toBe(false);
    expect(s.error).toBeTruthy();
  });
  it.skipIf(!echarts)("scores prose as invalid JSON", () => {
    const s = score("echarts", "Here is the option", rows, libs);
    expect(s).toMatchObject({ validJson: false, renders: false, nonBlank: false });
  });
  it.skipIf(!echarts)("scores a good ECharts option, and an empty one as blank", () => {
    const good = {
      xAxis: { type: "category" },
      yAxis: {},
      series: [{ type: "bar", encode: { x: "region", y: "revenue" } }],
    };
    expect(score("echarts", JSON.stringify(good), rows, libs)).toEqual({
      validJson: true,
      renders: true,
      nonBlank: true,
    });
    const empty = score("echarts", '{"series":[]}', rows, libs);
    expect(empty.renders).toBe(true);
    expect(empty.nonBlank).toBe(false);
  });
});

describe("summarize", () => {
  it("reports percentages of all answers", () => {
    const t = { validJson: true, renders: true, nonBlank: true };
    const f = { validJson: false, renders: false, nonBlank: false };
    expect(summarize([t, t, t, f])).toEqual({
      n: 4,
      validJsonPct: 75,
      rendersPct: 75,
      nonBlankPct: 75,
    });
  });
});

describe("dry run", () => {
  it.skipIf(!existsSync("dist/index.js"))("scores the sample file without the API", async () => {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync("node", ["eval/run.mjs", "eval/prompts.sample.jsonl", "--dry"], {
      encoding: "utf-8",
    });
    const j = JSON.parse(out.slice(out.indexOf("{\n")));
    expect(j.n).toBe(3);
    expect(j.libraries.mayacharts.validJsonPct).toBeGreaterThan(0);
  });
});
