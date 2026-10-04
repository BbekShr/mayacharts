// Scoring for the LLM eval. Pure functions; run.mjs wires in the real libraries.
//
// Three checks per answer, each a yes or no:
//   1. valid JSON:  the text parses as a JSON object. One leading and trailing Markdown code
//                   fence is stripped first, nothing else is repaired.
//   2. renders:     the library accepts it and returns an SVG string without throwing
//                   (mayaCharts: validateSpec + render; ECharts: SSR svg init + setOption).
//   3. non-blank:   the SVG has at least one mark. A mark is a path, rect, circle, ellipse or
//                   polygon outside <defs> and <clipPath> that is not (a) a rect covering the
//                   whole canvas, or (b) a path that is one straight segment, which is how axis
//                   lines, ticks and grid lines are drawn. Text does not count.

export interface Score {
  validJson: boolean;
  renders: boolean;
  nonBlank: boolean;
  error?: string;
}

export function parseJson(
  text: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const value: unknown = JSON.parse(t);
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return { ok: false, error: "JSON is not an object" };
    return { ok: true, value: value as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: `not JSON: ${(e as Error).message}` };
  }
}

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** Count marks in an SVG string by the rule at the top of this file. */
export function countMarks(svg: string): number {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
  const vb = attr(root, "viewBox")
    ?.split(/[\s,]+/)
    .map(Number);
  const W = Number(attr(root, "width")) || vb?.[2] || 0;
  const H = Number(attr(root, "height")) || vb?.[3] || 0;
  const body = svg
    .replace(/<defs\b[\s\S]*?<\/defs>/g, "")
    .replace(/<clipPath\b[\s\S]*?<\/clipPath>/g, "");
  let n = 0;
  for (const m of body.matchAll(/<(path|rect|circle|ellipse|polygon)\b[^>]*>/g)) {
    const tag = m[0];
    if (m[1] === "rect") {
      const w = parseFloat(attr(tag, "width") ?? "0");
      const h = parseFloat(attr(tag, "height") ?? "0");
      if (W && H && w >= W * 0.95 && h >= H * 0.95) continue;
      if (/%/.test(attr(tag, "width") ?? "") && parseFloat(attr(tag, "width") ?? "0") >= 95)
        continue;
    }
    if (m[1] === "path") {
      const d = attr(tag, "d") ?? "";
      // One move and one straight line: M x y L x y, M x y H x, M x y V y, or relative forms.
      if (/^\s*M[^MLHVZCQSTAmlhvzcqsta]*(?:[LHVlhv][^MLHVZCQSTAmlhvzcqsta]*)\s*$/.test(d)) continue;
    }
    n++;
  }
  return n;
}

export interface Libs {
  validateSpec: (spec: unknown) => unknown;
  render: (spec: any, opts?: { width?: number; height?: number }) => string;
  echarts: {
    init: (
      dom: null,
      theme: null,
      opts: Record<string, unknown>,
    ) => {
      setOption: (o: unknown) => void;
      renderToSVGString: () => string;
      dispose: () => void;
    };
  };
}

export const SIZE = { width: 640, height: 360 };
export type Library = "mayacharts" | "echarts";

/** Score one raw model answer. `rows` is the prompt's real data, filled in by the host. */
export function score(library: Library, text: string, rows: unknown[], libs: Libs): Score {
  const p = parseJson(text);
  if (!p.ok) return { validJson: false, renders: false, nonBlank: false, error: p.error };
  let svg = "";
  try {
    if (library === "mayacharts") {
      const spec = { ...p.value, data: rows };
      libs.validateSpec(spec);
      svg = libs.render(spec, SIZE);
    } else {
      const ds = p.value["dataset"];
      const keep = ds && typeof ds === "object" && !Array.isArray(ds) ? ds : {};
      const option = { ...p.value, animation: false, dataset: { ...keep, source: rows } };
      const c = libs.echarts.init(null, null, { renderer: "svg", ssr: true, ...SIZE });
      try {
        c.setOption(option);
        svg = c.renderToSVGString();
      } finally {
        c.dispose();
      }
    }
  } catch (e) {
    return {
      validJson: true,
      renders: false,
      nonBlank: false,
      error: String((e as Error).message).split("\n")[0] ?? "",
    };
  }
  return { validJson: true, renders: svg.includes("<svg"), nonBlank: countMarks(svg) > 0 };
}

const pct = (n: number, of: number): number => (of ? Math.round((n / of) * 1000) / 10 : 0);

export function summarize(scores: Score[]) {
  const n = scores.length;
  return {
    n,
    validJsonPct: pct(scores.filter((s) => s.validJson).length, n),
    rendersPct: pct(scores.filter((s) => s.renders).length, n),
    nonBlankPct: pct(scores.filter((s) => s.nonBlank).length, n),
  };
}
