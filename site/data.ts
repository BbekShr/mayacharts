export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Region = "Northeast" | "Midwest" | "South" | "West";
type Family = "Outerwear" | "Tops" | "Bottoms" | "Accessories";

export type Fact = {
  month: string;
  monthMs: number;
  state: string;
  stateName: string;
  region: Region;
  family: Family;
  item: string;
  sales: number;
  units: number;
  price: number;
  margin: number;
};

export const REGION_OF: Record<string, string> = {
  ME: "Northeast",
  NH: "Northeast",
  VT: "Northeast",
  MA: "Northeast",
  RI: "Northeast",
  CT: "Northeast",
  NY: "Northeast",
  NJ: "Northeast",
  PA: "Northeast",
  OH: "Midwest",
  IN: "Midwest",
  IL: "Midwest",
  MI: "Midwest",
  WI: "Midwest",
  MN: "Midwest",
  IA: "Midwest",
  MO: "Midwest",
  ND: "Midwest",
  SD: "Midwest",
  NE: "Midwest",
  KS: "Midwest",
  DE: "South",
  MD: "South",
  VA: "South",
  WV: "South",
  NC: "South",
  SC: "South",
  GA: "South",
  FL: "South",
  KY: "South",
  TN: "South",
  AL: "South",
  MS: "South",
  LA: "South",
  AR: "South",
  TX: "South",
  OK: "South",
  DC: "South",
  PR: "South",
  MT: "West",
  WY: "West",
  CO: "West",
  NM: "West",
  ID: "West",
  UT: "West",
  AZ: "West",
  NV: "West",
  WA: "West",
  OR: "West",
  CA: "West",
  HI: "West",
  AK: "West",
};

export const STATE_NAME: Record<string, string> = {
  ME: "Maine",
  NH: "New Hampshire",
  VT: "Vermont",
  MA: "Massachusetts",
  RI: "Rhode Island",
  CT: "Connecticut",
  NY: "New York",
  NJ: "New Jersey",
  PA: "Pennsylvania",
  OH: "Ohio",
  IN: "Indiana",
  IL: "Illinois",
  MI: "Michigan",
  WI: "Wisconsin",
  MN: "Minnesota",
  IA: "Iowa",
  MO: "Missouri",
  ND: "North Dakota",
  SD: "South Dakota",
  NE: "Nebraska",
  KS: "Kansas",
  DE: "Delaware",
  MD: "Maryland",
  VA: "Virginia",
  WV: "West Virginia",
  NC: "North Carolina",
  SC: "South Carolina",
  GA: "Georgia",
  FL: "Florida",
  KY: "Kentucky",
  TN: "Tennessee",
  AL: "Alabama",
  MS: "Mississippi",
  LA: "Louisiana",
  AR: "Arkansas",
  TX: "Texas",
  OK: "Oklahoma",
  DC: "District of Columbia",
  PR: "Puerto Rico",
  MT: "Montana",
  WY: "Wyoming",
  CO: "Colorado",
  NM: "New Mexico",
  ID: "Idaho",
  UT: "Utah",
  AZ: "Arizona",
  NV: "Nevada",
  WA: "Washington",
  OR: "Oregon",
  CA: "California",
  HI: "Hawaii",
  AK: "Alaska",
};

const STATES = Object.keys(STATE_NAME).sort();
const FAMILIES: Family[] = ["Outerwear", "Tops", "Bottoms", "Accessories"];

const ITEMS: Record<Family, string[]> = {
  Outerwear: ["Parka", "Shell", "Fleece"],
  Tops: ["T-Shirt", "Polo", "Sweater"],
  Bottoms: ["Jeans", "Chinos", "Shorts"],
  Accessories: ["Hat", "Scarf", "Gloves"],
};

const PRICES: Record<string, number> = {
  Parka: 240,
  Shell: 180,
  Fleece: 120,
  "T-Shirt": 25,
  Polo: 45,
  Sweater: 80,
  Jeans: 65,
  Chinos: 75,
  Shorts: 45,
  Hat: 30,
  Scarf: 40,
  Gloves: 35,
};

const MARGINS: Record<Family, number> = {
  Outerwear: 0.35,
  Tops: 0.4,
  Bottoms: 0.3,
  Accessories: 0.25,
};

export type Daily = {
  day: string;
  dayMs: number;
  weekday: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  week: number;
  orders: number;
};

export type Dataset = { FACTS: Fact[]; DAILY: Daily[] };

/**
 * One year of synthetic sales for `seed`. Each seed draws its own trend, seasonality and
 * region, state, family and item strengths, so aggregates change visibly between seeds
 * instead of averaging out.
 */
export function makeData(seed: number): Dataset {
  const rng = mulberry32(seed);
  const between = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const growth = between(-0.02, 0.06);
  const swing = between(0.05, 0.35);
  const peak = rng() * 12;
  const monthMul = Array.from(
    { length: 12 },
    (_, m) =>
      (1 + growth * m) *
      (1 + swing * Math.cos(((m - peak) / 12) * 2 * Math.PI)) *
      between(0.9, 1.1),
  );
  const mul = (keys: readonly string[], lo: number, hi: number) =>
    new Map(keys.map((k) => [k, between(lo, hi)]));
  const regionMul = mul(["Northeast", "Midwest", "South", "West"], 0.6, 1.5);
  const stateMul = mul(STATES, 0.25, 1.8);
  const itemMul = mul(Object.values(ITEMS).flat(), 0.4, 1.6);
  const mixMul = mul(
    ["Northeast", "Midwest", "South", "West"].flatMap((r) => FAMILIES.map((f) => `${r}|${f}`)),
    0.5,
    1.6,
  );
  const familyMargin = new Map(FAMILIES.map((f) => [f, MARGINS[f] + between(-0.08, 0.08)]));
  const stateMargin = mul(STATES, -0.06, 0.06);
  const itemMargin = mul(Object.values(ITEMS).flat(), -0.09, 0.09);

  const FACTS: Fact[] = [];
  for (let m = 0; m < 12; m++) {
    const month = `2025-${String(m + 1).padStart(2, "0")}`;
    const monthMs = Date.UTC(2025, m, 1);
    for (const state of STATES) {
      const stateName = STATE_NAME[state]!;
      const region = REGION_OF[state] as Region;
      for (const family of FAMILIES) {
        const base = familyMargin.get(family)! + stateMargin.get(state)! + (rng() - 0.5) * 0.04;
        for (const item of ITEMS[family]) {
          const margin = Math.max(-0.1, Math.min(0.5, base + itemMargin.get(item)!));
          const price = PRICES[item]!;
          const units = Math.max(
            1,
            Math.round(
              300 *
                monthMul[m]! *
                regionMul.get(region)! *
                stateMul.get(state)! *
                itemMul.get(item)! *
                mixMul.get(`${region}|${family}`)! *
                between(0.8, 1.2),
            ),
          );
          FACTS.push({
            month,
            monthMs,
            state,
            stateName,
            region,
            family,
            item,
            sales: units * price,
            units,
            price,
            margin,
          });
        }
      }
    }
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  const weekend = between(0.55, 0.9);
  const DAILY: Daily[] = [];
  for (let d = 0; d < 365; d++) {
    const date = new Date(Date.UTC(2025, 0, 1 + d));
    const dow = date.getUTCDay();
    const m = date.getUTCMonth();
    DAILY.push({
      day: date.toISOString().slice(0, 10),
      dayMs: date.getTime(),
      weekday: weekdays[dow]!,
      week: Math.floor((d + ((new Date(Date.UTC(2025, 0, 1)).getUTCDay() + 6) % 7)) / 7) + 1,
      orders: Math.round(
        400 * monthMul[m]! * (dow === 0 || dow === 6 ? weekend : 1) * between(0.75, 1.25),
      ),
    });
  }
  return { FACTS, DAILY };
}

export function rollup<T extends object>(
  rows: readonly T[],
  keys: readonly (keyof T)[],
  measures: Record<string, (rows: readonly T[]) => number>,
): Record<string, unknown>[] {
  const groupMap = new Map<string, T[]>();
  const order: T[] = [];
  for (const row of rows) {
    const keyStr = keys.map((k) => String(row[k])).join("|");
    if (!groupMap.has(keyStr)) {
      groupMap.set(keyStr, []);
      order.push(row);
    }
    groupMap.get(keyStr)!.push(row);
  }
  return order.map((first) => {
    const keyStr = keys.map((k) => String(first[k])).join("|");
    const group = groupMap.get(keyStr)!;
    const result: Record<string, unknown> = {};
    for (const k of keys) result[String(k)] = first[k];
    for (const [name, fn] of Object.entries(measures)) result[name] = fn(group);
    return result;
  });
}

export function sum<T extends object>(field: keyof T) {
  return (rows: readonly T[]): number =>
    rows.reduce((a, r) => a + (typeof r[field] === "number" ? r[field] : 0), 0);
}

export function mean<T extends object>(field: keyof T) {
  return (rows: readonly T[]): number => {
    const s = sum(field)(rows);
    return rows.length > 0 ? s / rows.length : 0;
  };
}

/** Normal draw from a uniform generator (Box-Muller). */
const gauss = (rng: () => number) =>
  Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

/** 50 000 synthetic (spend, revenue) points: three overlapping clusters of different spread. */
export function makePoints(seed: number, n = 50000) {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => {
    const k = rng();
    const [cx, cy, sx, sy] =
      k < 0.55 ? [30, 42, 9, 11] : k < 0.85 ? [62, 70, 12, 8] : [48, 20, 20, 6];
    const spend = cx + gauss(rng) * sx;
    return { spend: R2(spend), revenue: R2(cy + (spend - cx) * 0.4 + gauss(rng) * sy) };
  });
}
const R2 = (v: number) => Math.round(v * 100) / 100;

/** Exactly n (20 000) irregular ISO timestamps over 2025 (random gaps, two quiet stretches) with a drifting reading. */
export function makeReadings(seed: number, n = 20000) {
  const rng = mulberry32(seed);
  const start = Date.UTC(2025, 0, 1);
  const span = Date.UTC(2026, 0, 1) - start;
  const gaps: [number, number][] = [
    [0.31, 0.34],
    [0.72, 0.745],
  ];
  const out: { time: string; load: number }[] = [];
  let v = 50;
  const us: number[] = [];
  while (us.length < n) {
    const u = rng();
    if (!gaps.some(([a, b]) => u > a && u < b)) us.push(u);
  }
  for (const u of us.sort((a, b) => a - b)) {
    v += gauss(rng) * 0.8 + (50 + 12 * Math.sin(u * 12 * Math.PI) - v) * 0.02;
    out.push({ time: new Date(start + u * span).toISOString().slice(0, 19) + "Z", load: R2(v) });
  }
  return out;
}

/** "2025-01" to "2025-12" with one month missing (the axis keeps the hole). */
export function makeMonths(seed: number) {
  const rng = mulberry32(seed);
  const skip = 3 + Math.floor(rng() * 6);
  return Array.from({ length: 12 }, (_, m) => m)
    .filter((m) => m !== skip)
    .map((m) => ({
      month: `2025-${String(m + 1).padStart(2, "0")}`,
      orders: Math.round(900 + rng() * 700 + m * 40),
    }));
}

/** Three sensors read every 10 s: n readings each, time-major, so a window is a slice of rows. */
export function makeLive(seed: number, n = 300) {
  const rng = mulberry32(seed);
  const level = [40, 55, 70];
  const t0 = Date.UTC(2025, 5, 1, 9);
  return Array.from({ length: n }, (_, t) =>
    ["North", "Central", "South"].map((sensor, k) => {
      level[k]! += gauss(rng) * 1.2 + (50 + 15 * k - level[k]!) * 0.05;
      return {
        time: new Date(t0 + t * 1e4).toISOString().slice(0, 19) + "Z",
        sensor,
        load: R2(level[k]!),
      };
    }),
  ).flat();
}
