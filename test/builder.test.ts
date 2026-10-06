// The chart builder's pure half (site/builder-kit.ts). These tests are what keep the builder
// current: a new chart type or spec option fails here until the builder handles it.
import { describe, it, expect } from "vitest";
import schema from "../schema.json" with { type: "json" };
import pkg from "../package.json" with { type: "json" };
import { render, renderShell, validateSpec } from "../src/index.ts";
import "../src/hierarchy.ts";
import "../src/flow.ts";
import "../src/geo.ts";
import "../src/radial.ts";
import type { ChartSpec, ChartType } from "../src/index.ts";
import {
  INLINE,
  LIMITS,
  SAMPLES,
  SHOWN,
  SKIP,
  TABS,
  TYPES,
  VERSION,
  controls,
  cutNote,
  around,
  aroundOf,
  columnsOf,
  explain,
  formatFields,
  formatOf,
  FORMATS,
  helpFor,
  ROLES,
  TYPE_HELP,
  withFormat,
  guess,
  literal,
  parse,
  prober,
  reroll,
  roles,
  sample,
  snippets,
} from "../site/builder-kit.ts";

const run = (code: string): unknown => new Function(`return (${code});`)();
const marks = (svg: string) => (svg.match(/data-maya="mark"/g) ?? []).length;
const ok = (text: string) => {
  const p = parse(text);
  if ("error" in p) throw new Error(p.error);
  return p;
};
const err = (text: string) => {
  const p = parse(text);
  return "error" in p ? p.error : "";
};

describe("builder stays in step with the spec", () => {
  it("offers every chart type in schema.json, each with a sample that validates and draws", () => {
    expect(TYPES).toEqual(schema.properties.type.enum);
    expect(Object.keys(SAMPLES).sort()).toEqual([...TYPES].sort());
    for (const t of TYPES) {
      const spec = sample(t);
      expect(() => validateSpec(spec), t).not.toThrow();
      expect(marks(render(spec, { width: 640, height: 360 })), t).toBeGreaterThan(0);
      expect(roles(t), t).toContain("y");
    }
  });

  it("has a control or a deliberate skip for every option in schema.json", () => {
    const cs = controls();
    expect(cs.filter((c) => c.kind === "unknown").map((c) => c.key)).toEqual([]);
    const covered = new Set([...cs.map((c) => c.key), ...SKIP]);
    expect(Object.keys(schema.properties).filter((k) => !covered.has(k))).toEqual([]);
  });

  it("pins the CDN and npm version to package.json", () => {
    expect(VERSION).toBe(pkg.version);
    const s = snippets(sample("bar"));
    expect(s.HTML[0]!.code).toContain(
      `cdn.jsdelivr.net/npm/mayacharts@${pkg.version}/dist/maya.global.js`,
    );
    for (const t of ["React", "Vue", "Svelte", "Angular", "Node"] as const)
      expect(s[t][0]!.code, t).toContain(`npm install mayacharts@${pkg.version}`);
  });
});

describe("snippets", () => {
  it("every tab carries exactly the previewed spec, for every type", () => {
    for (const t of TYPES) {
      const spec = sample(t);
      const s = snippets(spec);
      expect(Object.keys(s)).toEqual([...TABS]);
      expect(JSON.parse(s.JSON[0]!.code), t).toEqual(spec);
      expect(run(literal(spec)), t).toEqual(spec);
      expect(run(literal(spec, "  ")), t).toEqual(spec);
      expect(s.HTML[0]!.code).toContain(literal(spec, "  "));
      expect(s.React[0]!.code).toContain(literal(spec));
      expect(s.Vue[0]!.code).toContain(literal(spec));
      expect(s.Svelte[0]!.code).toContain(literal(spec, "  "));
      expect(s.Angular[0]!.code).toContain(literal(spec, "  "));
      expect(s.Node[0]!.code).toContain(literal(spec));
    }
  });

  it("ThoughtSpot gets the tile shape: script tag, light page, constants, rows from the search", () => {
    for (const t of TYPES) {
      const spec = sample(t);
      const [html, css, js] = snippets(spec).ThoughtSpot;
      expect([html!.name, css!.name, js!.name]).toEqual(["chart.html", "chart.css", "chart.js"]);
      expect(html!.code).toContain(
        `<script src="https://cdn.jsdelivr.net/npm/mayacharts@${pkg.version}/dist/maya.global.js"></script>`,
      );
      expect(css!.code).toContain("color-scheme: light;");

      // Run chart.js with ThoughtSpot's globals stubbed: cells may come wrapped.
      const names = Object.keys(spec.data[0]!);
      const wrap = [
        (v: unknown) => v,
        (v: unknown) => ({ value: () => v }),
        (v: unknown) => ({ value: v }),
        (v: unknown) => ({ v }),
      ];
      const search = {
        schema: names.map((name) => ({ name })),
        data: spec.data.map((r, i) => names.map((n) => wrap[i % 4]!(r[n]))),
      };
      let got: unknown;
      let done = 0;
      const el = {
        set spec(v: unknown) {
          got = v;
        },
      };
      const viz = {
        getDataFromSearchQuery: () => ({ getData: () => search }),
        events: { emitRenderCompletedEvent: () => done++ },
      };
      let defined: () => void = () => {};
      new Function("document", "customElements", "viz", js!.code)(
        { getElementById: () => el },
        { whenDefined: () => ({ then: (f: () => void) => (defined = f) }) },
        viz,
      );
      expect(got, t).toEqual(spec);
      defined();
      expect(done, t).toBe(1);
    }
  });

  it("ThoughtSpot names each column once, as a constant to rename", () => {
    const spec = { ...sample("scatter"), format: { Price: "currency" } } as ChartSpec;
    const js = snippets(spec).ThoughtSpot[2]!.code;
    expect(js).toContain('const PRICE = "Price";');
    expect(js).toContain('const MARGIN = "Margin %";');
    expect(js).toContain("x: PRICE,");
    expect(js).toContain('format: { [PRICE]: "currency" },');
    const two = snippets({
      ...sample("table"),
      x: "Margin %",
      y: ["Margin %", "Price"],
    } as ChartSpec).ThoughtSpot[2]!.code;
    expect(two.match(/const MARGIN /g)).toHaveLength(1);
    const clash = snippets({
      type: "bar",
      x: "a b",
      y: "a-b",
      data: [{ "a b": "x", "a-b": 1 }],
    } as ChartSpec).ThoughtSpot[2]!.code;
    expect(clash).toContain('const A_B = "a b";');
    expect(clash).toContain('const A_B_2 = "a-b";');
  });

  it("imports the module a type needs", () => {
    expect(snippets(sample("treemap")).React[0]!.code).toContain('import "mayacharts/hierarchy";');
    expect(snippets(sample("sankey")).Node[0]!.code).toContain('import "mayacharts/flow";');
    expect(snippets(sample("bar")).React[0]!.code).not.toContain("mayacharts/hierarchy");
  });

  it("data cannot close the script element it is pasted into", () => {
    const spec = {
      ...sample("bar"),
      title: '</script><img src=x onerror="alert(1)">',
      data: [{ Family: "</SCRIPT>", Sales: 1, Region: "<!--" }],
    } as ChartSpec;
    for (const t of TABS) {
      const code = snippets(spec)
        [t].map((f) => f.code)
        .join("\n");
      expect(code, t).not.toContain("<img");
      expect(code, t).not.toContain('"<!--');
      expect(code.toLowerCase().split("</script>").length - 1, t).toBe(
        { HTML: 2, ThoughtSpot: 1, Vue: 1, Svelte: 1 }[t as string] ?? 0,
      );
    }
    expect(run(literal(spec))).toEqual(spec);
  });

  it("cuts long data to the first rows and says so", () => {
    const data = Array.from({ length: INLINE + 1 }, (_, i) => ({ Family: `F${i}`, Sales: i }));
    const spec = { type: "bar", x: "Family", y: "Sales", data } as ChartSpec;
    expect((run(literal(spec)) as ChartSpec).data).toEqual(data.slice(0, SHOWN));
    expect(cutNote(spec)).toContain(`first ${SHOWN} of 61 rows`);
    expect(cutNote({ ...spec, data: data.slice(0, INLINE) })).toBe("");
  });

  it("the Node snippet's call renders server HTML for every type", () => {
    for (const t of TYPES) {
      expect(snippets(sample(t)).Node[0]!.code).toContain(
        "renderShell(spec, { width: 640, height: 360 })",
      );
      expect(renderShell(sample(t), { width: 640, height: 360 }), t).toContain("<svg");
    }
  });
});

describe("paste", () => {
  it("reads CSV with quotes, CRLF, empty cells and formatted numbers", () => {
    const p = ok(
      '﻿Name,"Sales, net",Share,Note\r\n"Smith, J",-1.5,12%,"say ""hi"""\r\nLee,"1,200",$3,\r\n',
    );
    expect(p.cols).toEqual([
      { name: "Name", kind: "text" },
      { name: "Sales, net", kind: "number" },
      { name: "Share", kind: "number" },
      { name: "Note", kind: "text" },
    ]);
    expect(p.rows).toEqual([
      { Name: "Smith, J", "Sales, net": -1.5, Share: 12, Note: 'say "hi"' },
      { Name: "Lee", "Sales, net": 1200, Share: 3, Note: null },
    ]);
  });

  it("reads TSV from a spreadsheet, semicolons, short rows and quoted newlines", () => {
    expect(ok("a\tb\n1\t2\n").rows).toEqual([{ a: 1, b: 2 }]);
    expect(ok("a;b\nx;2,5\n").rows).toEqual([{ a: "x", b: "2,5" }]);
    expect(ok("a,b,c\nx,1\n").rows).toEqual([{ a: "x", b: 1, c: null }]);
    expect(ok('a,b\n"two\nlines",1\n').rows).toEqual([{ a: "two\nlines", b: 1 }]);
    expect(ok("d,v\n2024-01,1\n2024-02-03,2\n").cols[0]).toEqual({ name: "d", kind: "date" });
    expect(ok("z,v\n00501,1\n1e3,2\n").cols[0]!.kind).toBe("number");
  });

  it("reads a JSON array of objects", () => {
    const p = ok('[{"m":"Jan","v":1},{"m":"Feb","v":null,"w":true}]');
    expect(p.rows).toHaveLength(2);
    expect(p.cols.map((c) => c.name)).toEqual(["m", "v", "w"]);
    expect(p.cols[1]!.kind).toBe("number");
  });

  it("explains what is wrong instead of guessing", () => {
    expect(err("")).toMatch(/Paste CSV/);
    expect(err("a,b\n")).toMatch(/at least one row/);
    expect(err('a,b\n"x,1\n')).toMatch(/Line 2 opens a quote/);
    expect(err("a,a\n1,2\n")).toMatch(/"a" appears twice/);
    expect(err("a,b\n1,2,3\n")).toMatch(/Row 1 has 3 values but the header has 2/);
    expect(err("[1,2]")).toMatch(/Row 1 is not an object/);
    expect(err('[{"a":{"b":1}}]')).toMatch(/nested value/);
    expect(err('{"a":1}')).toMatch(/must be an array/);
    expect(err("[{")).toMatch(/not valid JSON/);
  });

  it("enforces the size, row and column limits, and accepts exactly the limit", () => {
    const big = "a\n" + "x".repeat(LIMITS.bytes);
    expect(err(big)).toMatch(/takes up to 1,000 KB/);
    const fits = "a\n" + "1\n".repeat((LIMITS.bytes - 2) / 2);
    expect(fits.length).toBe(LIMITS.bytes);
    expect(err(fits)).toMatch(/rows/); // within the byte limit, over the row limit

    const rows = (n: number) => "v\n" + "1\n".repeat(n);
    expect(ok(rows(LIMITS.rows)).rows).toHaveLength(LIMITS.rows);
    expect(err(rows(LIMITS.rows + 1))).toMatch(/5,001 rows. The builder previews up to 5,000/);
    expect(err(JSON.stringify(Array.from({ length: LIMITS.rows + 1 }, () => ({ v: 1 }))))).toMatch(
      /rows/,
    );

    const cols = (n: number) =>
      Array.from({ length: n }, (_, i) => `c${i}`).join(",") + "\n" + "1,".repeat(n - 1) + "1\n";
    expect(ok(cols(LIMITS.cols)).cols).toHaveLength(LIMITS.cols);
    expect(err(cols(LIMITS.cols + 1))).toMatch(/51 columns. The builder takes up to 50/);
  });

  it("guesses fields that draw for a typical table", () => {
    const p = ok(
      "Region,Family,Item,Sales,Units,Price\n" +
        ["North,Tops,Tee", "North,Bottoms,Jeans", "South,Tops,Sweater", "South,Bottoms,Chinos"]
          .map((r, i) => `${r},${100 + i * 10},${5 + i},${20 + i}`)
          .join("\n"),
    );
    // Hex map needs US states and a dumbbell exactly two series values: these say so instead.
    const needsOtherData = ["hexmap"];
    for (const t of TYPES as ChartType[]) {
      if (needsOtherData.includes(t)) continue;
      const spec = { type: t, ...guess(t, p.cols), data: p.rows } as ChartSpec;
      expect(() => validateSpec(spec), t).not.toThrow();
    }
  });
});

describe("guidance", () => {
  it("hides an option that needs a field this chart does not offer", () => {
    for (const t of ["bar", "line", "area", "dumbbell"] as ChartType[])
      expect(prober(sample(t))("drill", true), t).toMatchObject({ hide: true });
    expect(prober(sample("treemap"))("drill", true)).toBeNull();
  });

  it("disables, with the reason, an option that clashes with another one", () => {
    const drilled = { ...sample("treemap"), drill: true } as ChartSpec;
    expect(prober(drilled)("select", true)).toEqual({
      hide: false,
      why: '"Select" cannot be combined with "Drill".',
    });
    expect(prober(sample("bar"))("xType", "time")).toMatchObject({ hide: false });
    expect(prober(sample("bar"))("xType", "category")).toBeNull();
    const twoAxes = { ...sample("bar"), series: undefined, y2: "Units" } as unknown as ChartSpec;
    expect(prober(twoAxes)("horizontal", true)?.why).toMatch(
      /"Right axis line" cannot be combined/,
    );
  });

  it("probes nothing while the spec is already broken", () => {
    const broken = { ...sample("bar"), y: "Nope" } as ChartSpec;
    expect(prober(broken)("drill", true)).toBeNull();
  });

  it("explains errors in the builder's words", () => {
    const at = (spec: object) => {
      try {
        validateSpec(spec);
      } catch (e) {
        const { code, path, message } = e as { code: string; path: string; message: string };
        return explain(message, code, path);
      }
      throw new Error("expected an error");
    };
    const { series: _, ...noSeries } = sample("dumbbell");
    expect(at(noSeries)).toEqual({
      headline: '"Split by" is required but missing.',
      hint: 'Choose a column for "Split by" under Fields.',
    });
    expect(at({ ...sample("bar"), drill: true }).headline).toBe('"Drill" on "bar" needs "Levels".');
    expect(at({ ...sample("line"), stack: true }).headline).toBe(
      '"Stack" is not supported with a Line chart.',
    );
    for (const t of TYPES) {
      const e = at({ ...sample(t), y: "Nope" });
      expect(e.headline, t).not.toMatch(/spec\.|mayacharts:|https:/);
      expect(e.hint, t).not.toMatch(/https:/);
    }
  });
});

describe("re-roll", () => {
  it("keeps rows, keys, text and signs, changes the numbers, and still draws", () => {
    let i = 0;
    const rand = () => [0, 0.99, 0.5][i++ % 3]!;
    for (const t of TYPES) {
      const spec = sample(t);
      const next = reroll(spec, rand);
      expect(next.data, t).toHaveLength(spec.data.length);
      next.data.forEach((r, j) => {
        const was = spec.data[j]!;
        expect(Object.keys(r)).toEqual(Object.keys(was));
        for (const [k, v] of Object.entries(r))
          if (typeof v === "number") {
            expect(Number.isInteger(v)).toBe(true);
            expect(Math.sign(v)).toBe(Math.sign(was[k] as number));
          } else expect(v).toBe(was[k]);
      });
      expect({ ...next, data: [] }).toEqual({ ...spec, data: [] });
      expect(() => validateSpec(next), t).not.toThrow();
      expect(marks(render(next, { width: 640, height: 360 })), t).toBeGreaterThan(0);
    }
    const changed = reroll(sample("bar")).data.some(
      (r, j) => r["Sales"] !== sample("bar").data[j]!["Sales"],
    );
    expect(changed).toBe(true);
  });
});

describe("hover help and formats", () => {
  it("explains every chart type, field and option in plain words", () => {
    for (const t of TYPES) expect(TYPE_HELP[t], t).toBeTruthy();
    for (const k of [...ROLES, ...controls().map((c) => c.key)]) {
      expect(helpFor(k), k).toMatch(/^[A-Z"]/);
      expect(helpFor(k), k).not.toMatch(/`|spec\./);
    }
    expect(helpFor("select")).toMatch(/highlights/);
  });

  it("offers number presets for numbers and date presets for dates, covering the schema", () => {
    expect([...FORMATS.number, ...FORMATS.date].sort()).toEqual(
      [...schema.properties.format.oneOf[0]!.enum!].sort(),
    );
    expect(FORMATS.number).toContain("currency");
    expect(FORMATS.date).toContain("month");
  });

  it("formats each field on its own and drops fields no longer in use", () => {
    const spec = sample("scatter");
    const fields = formatFields(spec, columnsOf(spec.data));
    expect(fields).toEqual([
      { field: "Price", kind: "number", role: "x" },
      { field: "Margin %", kind: "number", role: "y" },
      { field: "Units", kind: "number", role: "size" },
    ]);
    const names = fields.map((f) => f.field);
    const one = { ...spec, format: withFormat(spec, names, "Price", "currency") } as ChartSpec;
    expect(one.format).toEqual({ Price: "currency" });
    const two = { ...one, format: withFormat(one, names, "Units", "compact") } as ChartSpec;
    expect(two.format).toEqual({ Price: "currency", Units: "compact" });
    expect(() => validateSpec(two)).not.toThrow();
    expect(render(two, { width: 640, height: 360 })).toContain("$50");
    expect(withFormat(two, ["Units"], "", "")).toEqual({ Units: "compact" });
    expect(withFormat(two, ["Units", "Price"], "Units", "")).toEqual({ Price: "currency" });
    expect(withFormat(one, ["Price"], "Price", "")).toBeUndefined();
    // A date category takes date styles, a text category words around it; series is never listed.
    expect(formatFields(sample("line"), columnsOf(sample("line").data))[0]).toEqual({
      field: "Month",
      kind: "date",
      role: "x",
    });
    expect(formatOf(sample("line"), "Month")).toBe("month");
    const bar0 = sample("bar");
    expect(formatFields(bar0, columnsOf(bar0.data)).map((f) => [f.field, f.kind])).toEqual([
      ["Family", "text"],
      ["Sales", "number"],
    ]);
    const words = around("Q{", " total}");
    expect(words).toBe("Q{value} total");
    expect(aroundOf(words)).toEqual(["Q", " total"]);
    expect(around("", "")).toBe("");
    const quarters = {
      ...bar0,
      format: withFormat(bar0, ["Family", "Sales"], "Family", words),
    } as ChartSpec;
    expect(() => validateSpec(quarters)).not.toThrow();
    expect(render(quarters, { width: 640, height: 360 })).toContain("QOuterwear total");
    // One preset for the whole spec covers every y, nothing else.
    const bar = sample("bar");
    expect(formatOf(bar, "Sales")).toBe("compact");
    expect(formatOf(bar, "Units")).toBe("");
  });
});
