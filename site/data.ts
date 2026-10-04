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

const rng = mulberry32(7);
export const FACTS: Fact[] = [];

for (let m = 0; m < 12; m++) {
  const month = `2025-${String(m + 1).padStart(2, "0")}`;
  const date = new Date(`${month}-01T00:00:00Z`);
  const monthMs = date.getTime();

  for (const state of STATES) {
    const stateNameVal = STATE_NAME[state];
    const regionVal = REGION_OF[state];
    if (!stateNameVal || !regionVal) continue;

    for (const family of FAMILIES) {
      const m_base = MARGINS[family];
      if (m_base === undefined) continue;
      const margin = Math.max(-0.1, Math.min(0.4, m_base + (rng() - 0.5) * 0.1));

      for (const item of ITEMS[family]) {
        const p = PRICES[item];
        if (p === undefined) continue;
        const baseUnits = 100 + Math.floor(rng() * 400);
        const variance = 0.8 + rng() * 0.4;
        const units = Math.max(1, Math.floor(baseUnits * variance));
        const sales = units * p;

        FACTS.push({
          month,
          monthMs,
          state,
          stateName: stateNameVal,
          region: regionVal as Region,
          family,
          item,
          sales,
          units,
          price: p,
          margin,
        });

        if (rng() < 0.15) {
          const units2 = Math.max(1, Math.floor((baseUnits * 0.6 + rng() * 200) * variance));
          const sales2 = units2 * p;
          FACTS.push({
            month,
            monthMs,
            state,
            stateName: stateNameVal,
            region: regionVal as Region,
            family,
            item,
            sales: sales2,
            units: units2,
            price: p,
            margin,
          });
        }
      }
    }
  }
}

export type Daily = {
  day: string;
  dayMs: number;
  weekday: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  week: number;
  orders: number;
};

const dailyRng = mulberry32(7);
export const DAILY: Daily[] = [];
for (let d = 0; d < 365; d++) {
  const date = new Date("2025-01-01T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + d);
  const dow = date.getUTCDay();
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow] as
    "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  DAILY.push({
    day: date.toISOString().slice(0, 10),
    dayMs: date.getTime(),
    weekday,
    week: Math.floor(d / 7) + 1,
    orders: (dow === 0 || dow === 6 ? 300 : 400) + Math.floor(dailyRng() * 200),
  });
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

export function count() {
  return (rows: readonly any[]): number => rows.length;
}

export function selfCheck(): void {
  if (FACTS.length < 8000 || FACTS.length > 14000)
    throw new Error(`FACTS.length ${FACTS.length} not in [8000, 14000]`);
  const validRegions = new Set(["Northeast", "Midwest", "South", "West"]);
  for (const f of FACTS)
    if (!validRegions.has(f.region)) throw new Error(`Invalid region: ${f.region}`);
  if (DAILY.length !== 365) throw new Error(`DAILY.length ${DAILY.length} !== 365`);
  const byRegion = rollup(FACTS, ["region"] as const, { n: count() });
  if (byRegion.length !== 4) throw new Error(`rollup by region: ${byRegion.length} !== 4`);
}
