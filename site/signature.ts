import type { ChartSpec, Row } from "../src/index.ts";
import {
  makeAccounts,
  makeGrowth,
  makeRanks,
  makeUnits,
  rollup,
  seedOf,
  sum,
  type Dataset,
} from "./data.ts";

/** The five charts no compared library draws. The gallery and the comparison page share these specs. */
export function signature({ FACTS }: Pick<Dataset, "FACTS">): Record<string, ChartSpec> {
  const out: Record<string, ChartSpec> = {};
  const tile = (id: string, spec: ChartSpec) => (out[id] = spec);
  // Weave: a bump chart of product lines; the climbing thread passes over the falling one.
  tile("weave", {
    type: "weave",
    title: "Product line rank by quarter",
    titles: { sales: "Sales ($K)" },
    x: "quarter",
    y: "sales",
    series: "line",
    select: true,
    data: makeRanks(seedOf(FACTS)),
  });

  // Memory: each family's second-half sales with its first-half sales as the ghost.
  const byHalf = rollup(
    FACTS.map((r) => ({ ...r, half: r.monthMs < Date.UTC(2025, 6, 1) ? "h1" : "h2" })),
    ["family", "half"],
    { sales: sum("sales") },
  ) as { family: string; half: string; sales: number }[];
  const fams = [...new Set(byHalf.map((r) => r.family))];
  const halfOf = (f: string, h: string) =>
    byHalf.find((r) => r.family === f && r.half === h)?.sales ?? 0;
  tile("memory", {
    type: "bar",
    title: "Sales by family, against the first half",
    titles: { sales: "Second half ($)", before: "First half ($)" },
    x: "family",
    y: "sales",
    was: "before",
    format: "compact",
    data: fams.map((f) => ({ family: f, sales: halfOf(f, "h2"), before: halfOf(f, "h1") })),
  });

  // 23c. Units: one dot per customer, flying between a waffle, bars by region and a spend swarm.
  tile("units", {
    type: "units",
    title: "Customers by region and spend",
    titles: { spend: "Annual spend ($)", region: "Region", customer: "Customer" },
    x: "region",
    y: "spend",
    name: "customer",
    format: { spend: "compact" },
    select: true,
    data: makeUnits(seedOf(FACTS)),
  });

  // 35. Orrery: size is sales, orbit rank follows size, speed and direction are growth.
  tile("orbit", {
    type: "orbit",
    title: "Sales and growth by family",
    titles: { sales: "Sales ($)", growth: "Growth (%)" },
    x: "family",
    y: "sales",
    y2: "growth",
    format: { sales: "compact" },
    colorBy: "sign",
    select: true,
    data: makeGrowth(seedOf(FACTS)),
  });

  // Constellation: 40 accounts placed by how alike their five measures are.
  tile("constellation", {
    type: "constellation",
    title: "Accounts that behave alike",
    titles: {
      revenue: "Revenue ($M)",
      growth: "Growth (%)",
      margin: "Margin (%)",
      tickets: "Tickets",
      nps: "NPS",
    },
    x: "account",
    y: ["revenue", "growth", "margin", "tickets", "nps"],
    size: "revenue",
    colorBy: "growth",
    select: true,
    data: makeAccounts(seedOf(FACTS)) as Row[],
  });

  return out;
}
