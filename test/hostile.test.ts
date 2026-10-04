// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import "../src/hierarchy.ts";
import "../src/flow.ts";
import "../src/geo.ts";
import { render, renderShell } from "../src/core/render.ts";
import { TEXT } from "../src/core/strings.ts";
import { MayaSpecError } from "../src/core/validate.ts";

const PAYLOADS = ["<img src=x onerror=alert(1)>", `"'&`, "</script>", "javascript:alert(1)", " "];
type S = Record<string, unknown>;
const D = (c: unknown, s: unknown, n: unknown) => [
  { c, s, v: 3, n },
  {
    c: typeof c === "number" ? c + 1 : "B",
    s: typeof s === "number" ? s + 1 : "T",
    v: 5,
    n: typeof n === "string" ? n + "2" : n,
  },
  { c: typeof c === "number" ? c + 2 : "C", s, v: 2, n: typeof n === "string" ? n + "3" : n },
];
const BASE: Record<string, (c: unknown, s: unknown, n: unknown) => S> = {
  bar: (c, s, n) => ({ type: "bar", x: "c", y: "v", series: "s", data: D(c, s, n) }),
  waterfall: (c, s, n) => ({ type: "waterfall", x: "c", y: "v", totals: ["C"], data: D(c, s, n) }),
  line: (c, s, n) => ({ type: "line", x: "c", y: "v", series: "s", data: D(c, s, n) }),
  area: (c, s, n) => ({ type: "area", x: "c", y: "v", series: "s", data: D(c, s, n) }),
  scatter: (c, s, n) => ({
    type: "scatter",
    x: "v",
    y: "v",
    name: "n",
    series: "s",
    data: D(c, s, n),
  }),
  heatmap: (c, s, n) => ({ type: "heatmap", x: "c", y: "v", series: "s", data: D(c, s, n) }),
  treemap: (c, s, n) => ({ type: "treemap", path: ["c", "s"], y: "v", data: D(c, s, n) }),
  sunburst: (c, s, n) => ({ type: "sunburst", path: ["c", "s"], y: "v", data: D(c, s, n) }),
  sankey: (c, s, n) => ({ type: "sankey", path: ["c", "s"], y: "v", data: D(c, s, n) }),
  hexmap: (c, s, n) => ({ type: "hexmap", x: "c", y: "v", data: D(c, s, n) }),
};

type Slot = (type: string, p: string) => S;
const plain = (type: string) => BASE[type]!("A", "S", "N");
const SLOTS: Record<string, Slot> = {
  title: (t, p) => ({ ...plain(t), title: p }),
  description: (t, p) => ({ ...plain(t), description: p }),
  "x values": (t, p) => BASE[t]!(p, "S", "N"),
  "series values/names": (t, p) => BASE[t]!("A", p, "N"),
  "name values": (t, p) => BASE[t]!("A", "S", p),
  titles: (t, p) => ({ ...plain(t), titles: { c: p, v: p, s: p, n: p } }),
  "format prefix/suffix": (t, p) => ({
    ...plain(t),
    format: { v: { prefix: p, suffix: p, maximumFractionDigits: 1 } },
  }),
  "text overrides": (t, p) => ({
    ...plain(t),
    text: Object.fromEntries(Object.keys(TEXT).map((k) => [k, p])),
  }),
  "colors object keys": (t, p) => ({ ...BASE[t]!("A", p, "N"), colors: { [p]: "#0b6" } }),
  "field name": (t, p) => {
    const s = JSON.parse(JSON.stringify(plain(t)).replace(/"c"/g, JSON.stringify(p)));
    return s;
  },
  totals: (t, p) => ({ ...BASE[t]!(p, "S", "N"), ...(t === "waterfall" ? { totals: [p] } : {}) }),
  "legend+table+labels": (t, p) => ({
    ...BASE[t]!(p, p, p),
    labels: true,
    table: true,
    legend: true,
  }),
};

function scan(root: ParentNode, out: string[]) {
  for (const el of Array.from(root.querySelectorAll("*"))) {
    const tag = el.tagName.toLowerCase();
    if (tag === "img") out.push("<img>");
    if (tag === "script" && el.getAttribute("type") !== "application/json")
      out.push("script:" + el.getAttribute("type"));
    for (const a of Array.from(el.attributes)) {
      if (/^on/i.test(a.name)) out.push("attr " + a.name);
      if (/^(href|src|xlink:href|action)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))
        out.push("js url");
    }
    if (tag === "template") scan((el as HTMLTemplateElement).content, out);
  }
}
function problems(html: string): string[] {
  const out: string[] = [];
  if (/<img/i.test(html)) out.push("raw <img");
  const scripts = html.match(/<script/gi)?.length ?? 0;
  const allowed = html.includes('<script type="application/json">') ? 1 : 0;
  if (scripts !== allowed) out.push(`script count ${scripts}`);
  const host = document.createElement("div");
  host.innerHTML = html;
  scan(host, out);
  return out;
}

const run = (fn: () => string): string | "skip" | "rejected" => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof MayaSpecError) return "rejected";
    if (e instanceof Error && e.message.includes("not implemented")) return "skip";
    throw e;
  }
};

describe.each(Object.keys(BASE))("hostile strings: %s", (type) => {
  for (const [name, slot] of Object.entries(SLOTS)) {
    it(`${name} is inert`, (ctx) => {
      let rendered = 0;
      for (const p of PAYLOADS) {
        const spec = slot(type, p);
        const svg = run(() => render(spec as never));
        if (svg === "skip") return ctx.skip();
        if (svg !== "rejected") {
          rendered++;
          expect(problems(svg), `render ${name} ${JSON.stringify(p)}`).toEqual([]);
        }
        const shell = run(() => renderShell(spec as never));
        if (shell === "skip") return ctx.skip();
        if (shell === "rejected") continue;
        expect(problems(shell), `shell ${name} ${JSON.stringify(p)}`).toEqual([]);
        const m = /<script type="application\/json">([\s\S]*)<\/script><\/maya-chart>$/.exec(shell);
        expect(m, "json child present").not.toBeNull();
        const parsed = JSON.parse(m![1]!);
        expect(parsed.type).toBe(type);
        expect(parsed.data).toHaveLength(3);
        if (name === "title") expect(parsed.title).toBe(p);
      }
      void rendered;
    });
  }
});

describe("unsafe CSS values are rejected", () => {
  const BAD = [
    'image-set("https://x" 1x)',
    "url(x)",
    "expression(x)",
    "}",
    "red; background:url(x)",
    "</style>",
  ];
  const base = (extra: S) => ({ type: "bar", x: "c", y: "v", data: [{ c: "a", v: 1 }], ...extra });
  const tokens = ["accent", "bg", "fg", "font", "radius", "series1", "tooltipBg"];
  for (const v of BAD) {
    it(`theme/colors ${JSON.stringify(v)}`, () => {
      for (const tk of tokens)
        expect(() => render(base({ theme: { [tk]: v } }) as never), tk).toThrow(MayaSpecError);
      expect(() => render(base({ colors: [v] }) as never)).toThrow(MayaSpecError);
      expect(() => render(base({ colors: { a: v } }) as never)).toThrow(MayaSpecError);
      expect(() => renderShell(base({ colors: ["#fff", v] }) as never)).toThrow(MayaSpecError);
    });
  }
  it("a safe colour still passes", () => {
    expect(() =>
      render(base({ colors: ["oklch(.6 .17 30)"], theme: { accent: "#0b6" } }) as never),
    ).not.toThrow();
  });
});
