import { expect, it } from "vitest";

it("renders with no window/document", async () => {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  const { render } = await import("../src/index.ts");
  expect(render({ type: "bar", data: [{ a: "x", b: 1 }], x: "a", y: "b" })).toContain("<svg");
  // The modules import core and register at load: they must load and draw without a DOM too.
  for (const m of [
    "hierarchy",
    "flow",
    "geo",
    "radial",
    "weave",
    "units",
    "orbit",
    "constellation",
  ])
    await import(`../src/${m}.ts`);
  const data = [
    { a: "x", b: 1, c: 2 },
    { a: "y", b: 3, c: 1 },
    { a: "z", b: 2, c: 3 },
  ];
  for (const type of ["weave", "units", "orbit"] as const)
    expect(
      render({ type, data, x: "a", y: "b", ...(type === "weave" && { series: "a" }) }),
    ).toContain('data-maya="mark"');
  expect(render({ type: "constellation", data, x: "a", y: ["b", "c"] })).toContain(
    'data-maya="mark"',
  );
});
