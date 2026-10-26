# Perf

## Method

1. **Measure before touching anything.** A perf claim without a number is a guess. Use the
   inspection tools in `/maya-verify`: a trace, a profile, timings over N runs (report the
   median and spread), bundle size, query count.
2. **Find the dominant cost** in the measurement. Fix that, not what looks slow in the code.
3. **One change at a time**, re-measuring after each.
4. **Prove it held:** same measurement, same conditions, before and after, in the report. A change
   that doesn't move the number gets reverted, however elegant it is.
5. **Guard it** where cheap: a budget, a query-count assertion, a size limit, so it can't regress
   silently.

## In this project

- Size is the first budget: `npm run build && npm run size` (gzip budgets in `package.json` `mayaSize`, theme also in `test/theme.test.ts`). Both are guarded gate files: report an overage and the cut, never raise a budget.
- Render timing: `test/perf.test.ts` (envelopes, doubled on CI runners) and `bench/stress.ts` (every type in Node). 1M rows: `node bench/million.mjs` after a build (Chromium), and the Scale page at `/scale.html`.
- Memory: `test/leak.test.ts`; peak RSS for row-count claims (see the columnar item in the backlog for the method).
- Main-thread freezes and frame timing: a Chromium performance trace through Playwright, plus webkit timings, because the two differ by up to 8x on this library.
- Hot paths: `group()` in `src/core/shape.ts`, the row caches (`memo` in `src/core/svg.ts`), the 10000-mark cap, `frame()` in `src/core/layout.ts`.
