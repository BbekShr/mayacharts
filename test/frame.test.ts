import { describe, expect, it } from "vitest";
import { render, renderParts, renderShell } from "../src/core/render.ts";
import { validateOptions, validateSpec } from "../src/core/validate.ts";
import type { ChartSpec, Row } from "../src/core/types.ts";

// Three frames; values grow per frame so a per-frame axis would move.
const data: Row[] = [2001, 2002, 2003].flatMap((y, i) =>
  ["A", "B", "C"].map((k, j) => ({ y, k, v: (i + 1) * (j + 1) * 10, note: "private" })),
);
const race = (o: Partial<ChartSpec> = {}): ChartSpec => ({
  type: "bar",
  data,
  x: "k",
  y: "v",
  frame: "y",
  title: "GDP",
  ...o,
});
const desc = (svg: string) => svg.match(/<desc[^>]*>([^<]*)<\/desc>/)![1]!;
const axisY = (svg: string) => svg.match(/<g data-maya="axis-y">.*?<\/g>/)![0];
const ys = (svg: string) =>
  [...svg.matchAll(/<rect data-maya="mark"[^>]*?data-y="([^"]*)"/g)].map((m) => +m[1]!);
const keys = (svg: string) =>
  [...svg.matchAll(/<rect data-maya="mark"[^>]*?data-key="([^"]*)"/g)].map((m) => m[1]);
const PLAY = '<button type="button" class="maya-play" data-maya="play">Play</button>';
const code = (f: () => void) => {
  try {
    f();
  } catch (e) {
    return (e as { code: string; path: string }).code + " " + (e as { path: string }).path;
  }
  return "ok";
};

describe("frame", () => {
  it("shows the last frame by default, named in the title and description", () => {
    const p = renderParts(race());
    expect(ys(p.svg)).toEqual([30, 60, 90]);
    expect(p.title).toBe('<div class="maya-title">GDP, 2003</div>');
    expect(p.svg).toContain(">GDP, 2003</title>");
    expect(desc(p.svg)).toMatch(/ Frame 3 of 3\.$/);
    expect(p.frame).toEqual([2, 3]);
    expect(p.controls).toBe(PLAY);
  });

  it("picks a frame with view.frame and clamps a larger index to the last", () => {
    const p = renderParts(race(), { view: { frame: 0 } });
    expect(ys(p.svg)).toEqual([10, 20, 30]);
    expect(p.title).toContain("GDP, 2001");
    expect(p.frame).toEqual([0, 3]);
    expect(renderParts(race(), { view: { frame: 99 } }).frame).toEqual([2, 3]);
  });

  it("keeps the value axis still across frames, a yDomain still wins", () => {
    const at = (frame: number, o?: Partial<ChartSpec>) =>
      axisY(renderParts(race(o), { view: { frame } }).svg);
    expect(at(0)).toBe(at(2));
    expect(at(0)).toContain(">100<");
    expect(at(0, { yDomain: [0, 50] })).toContain(">50<");
    expect(at(0, { yDomain: [0, 50] })).not.toContain(">100<");
  });

  it("keeps mark keys across frames, so a frame change is a keyed update", () => {
    const k0 = keys(renderParts(race(), { view: { frame: 0 } }).svg);
    expect(k0).toEqual(keys(renderParts(race()).svg));
    // sorted frames reorder the same keys
    const rev = data.map((r) => ({ ...r, v: r.y === 2003 ? 100 - (r.v as number) : r.v }));
    expect(keys(render(race({ data: rev, sort: "desc" })))).toEqual(["~C", "~B", "~A"].reverse());
  });

  it("formats the frame value with its format entry", () => {
    const rows = ["2024-11", "2024-12"].flatMap((m) => [{ m, k: "A", v: 1 }]);
    const p = renderParts({ ...race(), data: rows, frame: "m", format: { m: "month" } });
    expect(p.title).toContain("GDP, Dec 2024");
  });

  it("titles a spec without a title from the auto title", () => {
    expect(renderParts(race({ title: undefined } as never)).title).toBe(
      '<div class="maya-title">v by k, 2003</div>',
    );
  });

  it("has no Play button with a single frame", () => {
    const p = renderParts(race({ data: data.filter((r) => r.y === 2001) }));
    expect(p.controls).toBe("");
    expect(p.frame).toEqual([0, 1]);
  });

  it("puts Play after the measure toggle", () => {
    const rows = data.map((r) => ({ ...r, w: 1 }));
    const c = renderParts(race({ data: rows, y: ["v", "w"] })).controls;
    expect(c.startsWith('<div class="maya-ctl"')).toBe(true);
    expect(c.endsWith(PLAY)).toBe(true);
  });

  it("skips rows whose frame value is null", () => {
    const rows = [...data, { y: null, k: "A", v: 999 }];
    const p = renderParts(race({ data: rows }));
    expect(p.frame).toEqual([2, 3]);
    expect(axisY(p.svg)).not.toContain("1,000");
  });

  it("spans every frame on both scatter axes", () => {
    const pts = [1, 2].flatMap((f) => [{ f, x: f * 10, y: f * 100 }]);
    const s: ChartSpec = { type: "scatter", data: pts, x: "x", y: "y", frame: "f" };
    const a = renderParts(s, { view: { frame: 0 } }).svg.match(/data-xd="[^"]*" data-yd="[^"]*"/);
    const b = renderParts(s).svg.match(/data-xd="[^"]*" data-yd="[^"]*"/);
    expect(a![0]).toBe(b![0]);
  });

  it("works on line, area and dumbbell", () => {
    for (const type of ["line", "area"] as const)
      expect(renderParts(race({ type })).controls).toBe(PLAY);
    const dd = data.map((r, i) => ({ ...r, s: i % 2 ? "from" : "to" }));
    expect(renderParts(race({ type: "dumbbell", data: dd, series: "s" })).frame).toEqual([2, 3]);
  });

  it("takes text overrides and leaves a spec description alone", () => {
    const p = renderParts(
      race({ text: { play: "Abspielen", frameOf: "{1}: {0}", frame: "Bild {0}/{1}" } }),
    );
    expect(p.controls).toContain(">Abspielen</button>");
    expect(p.title).toContain("2003: GDP");
    expect(desc(p.svg)).toMatch(/ Bild 3\/3\.$/);
    expect(desc(renderParts(race({ description: "Mine." })).svg)).toBe("Mine.");
  });

  it("escapes hostile frame values and labels", () => {
    const evil = '<img src=x onerror=alert(1)>"';
    const rows = data.map((r) => ({ ...r, y: r.y === 2003 ? evil : r.y }));
    const s = renderShell(race({ data: rows, text: { play: "<b>go</b>" } }));
    expect(s).not.toContain("<img");
    expect(s).not.toContain("<b>");
    expect(s).toContain("GDP, &lt;img");
  });

  it("server-renders the button and keeps the frame field in the JSON child", () => {
    const s = renderShell(race(), { view: { frame: 1 } });
    expect(s).toContain(PLAY);
    expect(s).toContain("GDP, 2002");
    const json = JSON.parse(s.match(/<script type="application\/json">(.*)<\/script>/)![1]!);
    expect(json.data[0]).toEqual({ y: 2001, k: "A", v: 10 });
  });

  it("validates the spec and view.frame", () => {
    expect(code(() => validateSpec(race()))).toBe("ok");
    expect(code(() => validateSpec(race({ type: "heatmap", series: "k" })))).toBe(
      "option-unsupported frame",
    );
    expect(code(() => validateSpec(race({ frame: "year" })))).toBe("unknown-field frame");
    expect(code(() => validateSpec(race({ frame: 3 as never })))).toBe("invalid-option frame");
    expect(code(() => validateSpec({ ...race(), timeline: "y" }))).toBe("unknown-option timeline");
    try {
      validateSpec({ ...race(), timeline: "y" });
    } catch (e) {
      expect((e as Error).message).toContain('Use frame: "<field>".');
    }
    for (const frame of [-1, 1.5, "1"])
      expect(code(() => validateOptions({ view: { frame } }))).toBe(
        "invalid-option options.view.frame",
      );
  });

  it("leaves specs without frame unchanged", () => {
    const { frame, title, ...plain } = race();
    void frame;
    void title;
    const p = renderParts({ ...plain, data: data.filter((r) => r.y === 2003) } as ChartSpec);
    expect(p.frame).toBeUndefined();
    expect(p.controls).toBe("");
    expect(p.title).toBe("");
  });
});

describe("frame cap", () => {
  const rows = (frames: number, per: number): Row[] =>
    Array.from({ length: frames * per }, (_, i) => ({ f: i % frames, k: "k" + (i % per), v: i }));
  it("fails past 200 frames with too-many-marks", () => {
    expect(() =>
      render({ type: "bar", data: rows(201, 1), x: "k", y: "v", frame: "f" }),
    ).toThrowError(/too-many-marks|exceed the limit of 200/);
  });
  it("renders 200 frames x 5000 rows in reasonable time", () => {
    const t0 = performance.now();
    render({ type: "bar", data: rows(200, 25).concat(rows(200, 25)), x: "k", y: "v", frame: "f" });
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
