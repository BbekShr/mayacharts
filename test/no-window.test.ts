import { expect, it } from "vitest";

it("renders with no window/document", async () => {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  const { render } = await import("../src/index.ts");
  expect(render({ type: "bar", data: [{ a: "x", b: 1 }], x: "a", y: "b" })).toContain("<svg");
});
