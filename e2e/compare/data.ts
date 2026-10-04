// One deterministic dataset for every library. No Math.random: the same bytes on every run.
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SIZE = { width: 640, height: 360 };
export const SERIES = ["North", "South", "West"];
export const LINES = ["Plan", "Actual"];
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function makeData() {
  const r = rng(20260101);
  const cats = Array.from({ length: 12 }, (_, i) => `Cat ${String(i + 1).padStart(2, "0")}`);
  const bar = cats.flatMap((c) =>
    SERIES.map((s) => ({ cat: c, series: s, value: Math.round(20 + r() * 80) })),
  );
  const line = LINES.flatMap((s, k) => {
    let v = 100 + k * 15;
    return Array.from({ length: 36 }, (_, m) => {
      v += (r() - 0.45) * 12;
      return { t: Date.UTC(2023, m, 1), series: s, value: Math.round(v * 10) / 10 };
    });
  });
  const scatter = Array.from({ length: 50_000 }, () => {
    const x = r() * 100;
    return { x: Math.round(x * 100) / 100, y: Math.round((x * 0.6 + r() * 40) * 100) / 100 };
  });
  const heatmap = DAYS.flatMap((d, di) =>
    Array.from({ length: 24 }, (_, h) => ({
      hour: String(h).padStart(2, "0"),
      day: d,
      value: Math.round(10 + r() * 60 + (h > 8 && h < 18 && di < 5 ? 30 : 0)),
    })),
  );
  return { bar, line, scatter, heatmap, meta: { SERIES, LINES, DAYS } };
}
