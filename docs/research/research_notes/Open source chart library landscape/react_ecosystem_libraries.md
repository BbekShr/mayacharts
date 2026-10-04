# React-Ecosystem (and Related Framework-Native) Charting Libraries

Snapshot comparison table (GitHub metadata pulled directly via GitHub API, Oct 3, 2026):

| Library | Stars | Open issues | Last push | Archived? | License |
|---|---|---|---|---|---|
| Recharts | 27,613 | 451 | 2026‑10‑03 | No | MIT — [repo](https://github.com/recharts/recharts) |
| Nivo | 14,106 | 52 | 2026‑07‑21 | No | MIT — [repo](https://github.com/plouc/nivo) |
| Victory | 11,238 | 92 | 2025‑12‑19 | No | License field returns `NOASSERTION` on GitHub API (repo itself states MIT in LICENSE.txt historically) — [repo](https://github.com/FormidableLabs/victory) |
| visx | 21,076 | 155 | 2026‑06‑22 | No | MIT — [repo](https://github.com/airbnb/visx) |
| Tremor (`@tremor/react`) | 3,644 | 27 | 2025‑10‑10 | No | Apache-2.0 — [repo](https://github.com/tremorlabs/tremor) |
| Tremor Raw | 3 (separate, largely inactive mirror repo found) | 0 | 2025‑01‑01 | No | none declared | [repo](https://github.com/tremorlabs/tremor-raw) — NB: this specific repo looks like a stub/mirror, not Tremor Raw's real activity; Tremor Raw's actual docs/code live under raw.tremor.so and the main tremorlabs org, so this star count likely understates real usage (see Gaps). |
| Unovis | 2,857 | 111 | 2026‑10‑02 | No | Apache-2.0 — [repo](https://github.com/f5/unovis) |
| Chartkick | 6,528 | 7 | 2026‑08‑15 | No | MIT — [repo](https://github.com/ankane/chartkick) |

---

## Recharts: is the "large dataset / re-render problem" reputation justified, and what's the current state after v3?

### Takeaway
Recharts' reputation for re-render and large-dataset performance problems is well documented in its own issue tracker going back years (deep-equal props comparisons, anonymous event handlers forcing full re-renders, multi-second renders past ~10k points, crashes past tens of thousands of points). Recharts 3 (released July 1, 2025) is a from-scratch state-management rewrite aimed partly at these problems, and ships accessibility-by-default, but there is not yet strong independent evidence (benchmarks) that the large-dataset ceiling has fundamentally changed — downsampling is still something users must do themselves.

### Cited Findings
- Recharts is described as a "Redefined chart library built with React and D3" with 27,613 stars and MIT license, actively pushed as of Oct 2026 — [GitHub repo](https://github.com/recharts/recharts).
- Issue #2862: the handler returned by `combineEventHandlers` is an anonymous function that changes identity on every render, causing all `Scatter` elements to re-render on every props/state change — a cited cause of poor performance on big charts — [GitHub #2862](https://github.com/recharts/recharts/issues/2862).
- Issue #281 / PR #277: Recharts used a deep-equal comparison instead of shallow comparison, which was expensive and recomputed on every event; for graphs with hundreds/thousands of points this became very slow — [GitHub #281](https://github.com/recharts/recharts/issues/281), [PR #277](https://github.com/FormidableLabs/victory/pull/277) (note: PR number returned under recharts context in search, treat as recharts-side fix).
- Issue #1465: with ~10,000 items on a simple `LineChart`, adding an `XAxis` with the default `interval="preserveEnd"` causes rendering to take several seconds — [GitHub #1465](https://github.com/recharts/recharts/issues/1465).
- Issue #1356: `LineChart` is "very laggy" with 8K dots; the community has requested a largest-triangle-three-buckets (LTTB) downsampling algorithm be built in — [GitHub #1356](https://github.com/recharts/recharts/issues/1356).
- Discussion #3181: users report that scatter plots with ~50,000 objects crash the chart once data climbs past roughly 10,000 points — [GitHub Discussion #3181](https://github.com/recharts/recharts/discussions/3181).
- Issue #1146 is literally titled "Recharts is slow with large data" — [GitHub #1146](https://github.com/recharts/recharts/issues/1146).
- Tooltip positioning/customization is a recurring friction point: a GitHub discussion (#4000) shows users struggling to position tooltips relative to the actual data point rather than the mouse cursor, and the library is reported as not making tooltip positioning easy in general — [GitHub Discussion #4000](https://github.com/recharts/recharts/discussions/4000).
- Recharts 3.0 (released July 1, 2025, ~95% authored by maintainer Pavel Vaněček) rewrote internal state management into smaller chunks, added ~3,500 unit tests, removed the `react-smooth` and `recharts-scale` dependencies, turned on `accessibilityLayer` (keyboard tab/arrow navigation) by default on cartesian and polar charts, and added multi-axis polar chart support — [Recharts v3.0.0 release notes](https://github.com/recharts/recharts/releases/tag/v3.0.0), [React Status #433 coverage](https://react.statuscode.com/issues/433).
- Bundle size: full Recharts package is ~515 kB minified / ~136 kB gzipped as of v3.8.1+, though real-world apps using selective imports/tree-shaking typically ship closer to ~50 kB gzipped — [PkgPulse guide](https://www.pkgpulse.com/guides/recharts-v3-vs-tremor-vs-nivo-react-charting-2026). (Note: this is a secondary/aggregator source, not Bundlephobia directly — treat the exact figure as approximate.)
- Praise, consistently: Recharts is called out as the easiest/most popular choice for "pre-built, easy-to-use charts with good documentation," and leads in adoption/popularity among React chart libraries — [comparison roundup](https://dev.to/pccprint/top-react-charts-libraries-2021-50be) type sources and LogRocket's 2026 roundup — [LogRocket: Best React chart libraries in 2026](https://blog.logrocket.com/best-react-chart-libraries-2026/).

### Inferences
- The performance complaints cluster around two mechanisms: (1) unnecessary re-renders from unstable prop/handler identities, and (2) linear/SVG-DOM-node-per-point rendering with no built-in downsampling — both are architectural consequences of Recharts being a fully declarative, per-point SVG component model (a `<Line>`/`<Bar>` renders real DOM/SVG nodes per data point rather than batching to canvas).
- The v3 rewrite addresses the first mechanism (re-render churn) more directly than the second (raw large-N rendering ceiling); LTTB-style downsampling still appears to be something developers must implement themselves rather than a built-in toggle.
- Recharts' popularity (highest star count of the pure-React libraries here) is precisely why its performance complaints are the most visible — it is the default choice for dashboards that later scale into "large dataset" territory.

### Gaps
- No independent, recent (post-v3) benchmark was found quantifying how much the v3 rewrite actually improved large-dataset render times or re-render counts versus v2 — this would need a dedicated performance test, not found in search results.
- Could not verify the current (2026) open-issue backlog breakdown by label/category (e.g., how many of the 451 open issues are performance-tagged) — GitHub API count alone doesn't segment causes.

---

## Nivo: SSR support, bundle size, and customization/type-safety friction

### Takeaway
Nivo's reputation is "beautiful, accessible, feature-rich defaults at the cost of bundle size and some Next.js/SSR friction" — it needs explicit Client Component boundaries under Next.js App Router, and its modular per-chart-type packages (`@nivo/bar`, `@nivo/line`, etc.) are individually heavy even though the library overall is tree-shakeable.

### Cited Findings
- Nivo has 14,106 stars, MIT license, and was last pushed 2026‑07‑21 (less frequent cadence than Recharts/visx/Unovis, which all pushed within the last ~3 months as of Oct 2026) — [GitHub repo](https://github.com/plouc/nivo).
- GitHub Issue: "Nivo unable to SSR with Next 13+" — attempting to render Nivo charts without a `"use client"` directive under the Next.js 13+ App Router throws `TypeError: createContext only works in Client Components` — [GitHub plouc/nivo #2626](https://github.com/plouc/nivo/issues/2626).
- Despite SSR friction in App Router specifically, Nivo's SVG/HTML chart variants are generally cited as able to pre-render/SSR, and Nivo is called out as "the only charting library that provides the ability to generate charts on the server-side as well" in some comparisons — [comparison roundups](https://querio.ai/articles/top-react-chart-libraries) (secondary source; treat the "only" claim with caution since Unovis and others can also render server-side under some setups).
- Bundle size: estimates vary by source — one comparison cites Nivo at 389 kB minified overall, another cites `@nivo/core` alone at ~285 kB gzipped with each additional chart package (e.g., `@nivo/line`) adding ~140 kB gzipped on top; a separate estimate puts a full Nivo install at 500kB+ versus Recharts' ~150kB — [bundle comparison roundup](https://blog.logrocket.com/react-area-chart-comparison/), [PkgPulse](https://www.pkgpulse.com/guides/recharts-vs-chartjs-vs-nivo-vs-visx-react-charting-2026). These figures disagree with each other by a wide margin across sources — flagged as a genuine inconsistency rather than resolved.
- Accessibility is a consistently praised area: Nivo ships ARIA labels and keyboard navigation built-in, offers an HTML rendering mode specifically "for maximum accessibility" in addition to SVG/Canvas, and is called out favorably in head-to-head accessibility comparisons of chart libraries — [theAdhocracy accessible chart library note](https://theadhocracy.co.uk/note/accessible-chart-data-library). The same source caveats that data is "still not adequately associated with labels in all cases," though it is at least accessible as text nodes.
- General design praise: Nivo is repeatedly described as "the best looking," with strong default color/texture options, extensive documentation with examples/templates/storybooks, and a wide chart-type catalogue (including radial, heatmap, canvas-rendered variants for high point counts) — [nivo.rocks docs](https://nivo.rocks/bar/canvas/), [Creowis Nivo guide](https://www.creowis.com/blog/nivo-charts-with-react-comprehensive-guide).
- Customization/type-safety friction is described qualitatively rather than via a single definitive thread: Nivo trades a heavier install and "a more opinionated API" for its visual polish and built-in a11y — [LogRocket 2026 roundup](https://blog.logrocket.com/best-react-chart-libraries-2026/).

### Inferences
- Nivo's architecture (D3 + React, per-chart-type npm packages, Canvas variants available for some chart types like Bar) means bundle size is a tax paid per chart type imported, not a single fixed cost — teams using 3-4 different Nivo chart types will accumulate size faster than the "just @nivo/core" baseline suggests.
- The SSR/Next.js issue is specifically an App Router Client Component boundary problem (a React Context usage pattern), not a fundamental SSR incompatibility — it is a one-line fix (`"use client"`) but trips up developers unfamiliar with the requirement, which is why it recurs as a complaint.

### Gaps
- No single authoritative Bundlephobia-sourced number for Nivo was retrieved directly (only aggregator-blog estimates that disagree with each other); a direct Bundlephobia page fetch would resolve this but wasn't performed within budget.
- No direct Reddit r/reactjs thread specifically about Nivo type-safety friction was found in search results — the customization/type-safety claim rests on secondary blog commentary rather than a primary community thread; flagged as weaker evidence than the SSR GitHub issue.

---

## visx: the "low-level building blocks" tradeoff, and is it still actively maintained post-Airbnb changes?

### Takeaway
visx is explicitly not a chart library but a set of low-level, D3-powered visualization primitives (shapes, scales, axes, tooltips, brush, geo) that developers compose into their own charts — community sentiment is split between praise for the resulting control/bundle discipline and real frustration over slow maintenance cadence, with visx v4 only reaching stable release in June 2026 after roughly 7 months in alpha, prompting some heavy users to migrate away.

### Cited Findings
- visx has 21,076 stars (second-highest in this set, ahead of Nivo and Victory) and was last pushed 2026‑06‑22, MIT license — [GitHub repo](https://github.com/airbnb/visx).
- visx is officially described by Airbnb as "low-level visualization components"; it is explicitly positioned as primitives, not ready-made charts — "visx is not a charting library ... As you start using visualization primitives, you'll end up building your own charting library optimized for your use case" — [Airbnb open source visx page](https://airbnb.tech/opensource/visx/).
- In the airbnb/visx maintenance discussion thread, a maintainer stated as of May 22, 2025: "yes visx is still maintained and under development" — [GitHub Discussion #1908](https://github.com/airbnb/visx/discussions/1908).
- visx 4.0 alpha (4.0.0-alpha.0) shipped around November 2025 for community feedback, with the stable v4.0 release landing in June 2026 — a roughly 7-month alpha period — addressing React 18/19 support — [GitHub Discussion #1908 summary](https://github.com/airbnb/visx/discussions/1908).
- Community concerns documented in that same discussion: extended periods without maintainer updates or PR reviews, release delays, and several "heavy users" deciding to migrate away from visx specifically because of maintenance-reliability concerns — [GitHub Discussion #1908](https://github.com/airbnb/visx/discussions/1908).
- Separately, one aggregator source states visx v4 "needs React 18 or 19, and ships no animation" — flagged as a specific, checkable claim about a feature gap (no built-in animation primitives) but sourced from a secondary aggregator rather than primary docs — [hysenlabs.com project note](https://hysenlabs.com/projects/airbnb-visx).
- On the praise side: "If you can imagine it in SVG or D3, you can build it in visx — you are never blocked by an API that doesn't support a specific customization," and developers who initially found building charts with visx "tedious and hard" report learning to "love its concise API and the power and flexibility it gives" over time — [LogRocket intro to visx](https://blog.logrocket.com/introduction-to-visx/) (paraphrased secondary-source sentiment; exact quote attribution to a single named developer not found).
- Bundle-size discipline is the most concrete, consistently repeated praise: visx core primitives run roughly 15 kB minified / ~5 kB gzipped per package, and a typical custom chart assembled from 4-6 visx packages totals ~30-40 kB gzipped — substantially smaller than a full Recharts or Nivo install — [PkgPulse bundle comparison](https://www.pkgpulse.com/guides/recharts-vs-chartjs-vs-nivo-vs-visx-react-charting-2026).
- The learning-curve complaint is explicit and recurring: visx "has a steep learning curve"; using it requires understanding D3-style concepts (scales, domains, ranges) and raw SVG attributes — it is "not plug and play" — [Noizz visx review 2026](https://noizz.io/reviews/visx-review) / [LogRocket](https://blog.logrocket.com/introduction-to-visx/).

### Inferences
- visx sits at a genuinely different point on the build-vs-buy spectrum than every other library in this set except maybe raw D3 — the "tradeoff" question in the prompt is really: teams pick visx when they need pixel-level custom visualizations AND have in-house dataviz/D3 expertise and time budget; teams without that expertise consistently report frustration and often fall back to Recharts/Nivo/Victory for anything resembling a "standard" chart.
- "Still maintained by Airbnb" is technically true (commits continue, v4 shipped in 2026) but the lived experience reported by its own community (slow PR review, long alpha periods) means it behaves, in practice, more like a side project with occasional dedicated maintainer attention than a fully-resourced product team — this is a meaningful distinction for anyone assessing risk of adoption.

### Gaps
- Could not confirm whether Airbnb corporate sponsorship/resourcing for visx has formally changed (e.g., dedicated headcount reduced) — only indirect evidence (release cadence, community discussion) was available; no official Airbnb engineering-blog statement on visx's current staffing was found.
- Could not find a primary Reddit r/reactjs thread specifically weighing the visx build-vs-buy tradeoff with direct user quotes — the "praise" evidence here leans on blog/review aggregator paraphrase rather than a verifiable forum quote; flagged as moderate-confidence evidence.

---

## Victory: is it still actively maintained in 2026, and how does Victory Native's architecture differ?

### Takeaway
The core Victory (web/SVG) library shows real but slowed activity (last push 2025‑12‑19, ~3.5 months stale as of question date), while Formidable itself rebranded to Nearform and some adjacent Victory sub-projects (victory-cli, victory-chart as a standalone repo) have been explicitly deprecated/archived — Victory Native, in contrast, was rewritten ("Victory Native XL") onto React Native Skia + Reanimated and is described as actively developed by Nearform.

### Cited Findings
- Main `FormidableLabs/victory` repo: 11,238 stars, 92 open issues, last pushed 2025‑12‑19, license field returns `NOASSERTION` via GitHub API — [GitHub repo](https://github.com/FormidableLabs/victory).
- Formidable Labs' GitHub org is now labeled "Formidable, now Nearform" — i.e., Formidable was absorbed into/rebranded as Nearform — [FormidableLabs GitHub org page](https://github.com/FormidableLabs).
- `victory-cli` is explicitly marked as no longer maintained by Formidable, with maintainers stating they are no longer responding to issues or PRs unless they relate to security — [FormidableLabs/victory-cli](https://github.com/FormidableLabs/victory-cli).
- `victory-chart` (the standalone predecessor/component repo) was archived by its owner on Feb 19, 2022 — [FormidableLabs/victory-chart](https://github.com/FormidableLabs/victory-chart).
- Search-result characterization of the current status: "The main Victory library is marked as 'Active' with Formidable actively working on the project and expecting to continue work for the foreseeable future," and "Victory Native XL: Nearform is actively working on this project" — these characterizations come from secondary aggregator/search-summary text rather than a directly quoted, dated maintainer statement, so confidence is moderate — [search roundup, no single primary URL isolated].
- Victory Native architecture: Victory Native (and its successor "Victory Native XL") is built on `@shopify/react-native-skia` for GPU-accelerated canvas rendering, `react-native-reanimated` for UI-thread animation, and `react-native-gesture-handler` for native touch gestures — this is architecturally distinct from the SVG-based web Victory package — [npm victory-native](https://www.npmjs.com/package/victory-native), [Nearform blog: "Victory Native Turns 40"](https://nearform.com/digital-community/victory-native-turns-40/).
- Victory Native requires a development build (not compatible with plain Expo Go) and depends on installing Skia, Reanimated, and Gesture Handler separately — [ShipNative React Native charts guide](https://www.shipnative.dev/blog/react-native-charts).
- The Skia/Reanimated architecture is specifically cited as solving the jank that SVG-based React Native chart libraries (react-native-chart-kit, react-native-svg-charts) exhibit on large datasets, because Skia draws directly to the GPU rather than diffing SVG DOM nodes — [ShipNative guide](https://www.shipnative.dev/blog/react-native-charts).

### Inferences
- "Still maintained" for Victory in 2026 is best characterized as "maintained but visibly slower-cadence than its peak," consistent with the broader Formidable→Nearform organizational transition — the web Victory package getting a push roughly every few months (vs. Recharts/visx/Unovis pushing within the last day/weeks) is a real, measurable maintenance-velocity gap even though the repo is not archived.
- Victory's two halves (web/SVG "Victory" vs. "Victory Native") have diverged significantly in both architecture and apparent momentum — Victory Native's Skia rewrite looks like the more energetically maintained half of the project going into 2026, which is a nuance worth flagging since a developer searching "is Victory maintained" may get a misleadingly uniform answer.

### Gaps
- No official Nearform blog post or FormidableLabs README banner explicitly stating current staffing/roadmap commitment for the *web* Victory package specifically was found (as opposed to Victory Native, which has a dedicated Nearform blog post) — this is a real gap; the "Active" characterization for core Victory rests on secondary search-summary text, not a primary maintainer statement with a URL and date.
- Could not verify the actual SPDX license text given GitHub API returned `NOASSERTION` — the repo may have a non-standard LICENSE file; this should be checked against the repository's actual LICENSE.md before publishing a definitive license claim.

---

## Tremor vs. Tremor Raw: positioning, difference, and reception after the Vercel acquisition

### Takeaway
Tremor (`@tremor/react`) is a pre-styled, opinionated npm component library for dashboards built on Tailwind CSS design tokens; Tremor Raw is the newer, unstyled/copy-paste variant (Radix UI + plain Tailwind, no custom Tremor color tokens) analogous to shadcn/ui's model — Vercel acquired Tremor in January 2025, made all components free/open source, and the founders joined Vercel's Design Engineering team, which materially changes the "who's backing this" calculus versus a standalone startup.

### Cited Findings
- `@tremor/react` (main npm package / `tremorlabs/tremor` repo): 3,644 stars, Apache-2.0 license, last pushed 2025‑10‑10 — [GitHub repo](https://github.com/tremorlabs/tremor).
- Vercel completed its acquisition of Tremor on January 21, 2025; terms were not disclosed — [MergerLinks transaction record](https://app.mergerlinks.com/transactions/2025-01-21-tremor/service-providers), [Reid Burke's write-up](https://reidburke.com/updates/2025/01/vercel-acquires-tremor/).
- As part of the acquisition, all Tremor components (including "Blocks") became free and open source, and Tremor's cofounders Severin Landolt and Christopher Kindl joined Vercel's Design Engineering team to work on UI components for the Vercel Dashboard and v0 — [DeepNewz coverage](https://deepnewz.com/software/vercel-acquires-tremor-open-sources-all-react-components-charts-dashboards-now-84750143).
- Difference confirmed from docs/comparison sources: Tremor Raw "uses plain Tailwind CSS, meaning there are no custom Tremor color tokens in your code," ships as copy-and-paste components (imported directly into `src/components/`), and requires Tailwind CSS v4+ and Radix UI — and, notably, **Tremor Raw's own chart components are built on top of Recharts** — [LogRocket Tremor dashboard guide](https://blog.logrocket.com/build-react-dashboard-tremor/).
- Developers can now choose between the NPM package (`@tremor/react`, pre-built components with Tremor's own design tokens, e.g. `<AreaChart>`, `<Card>`) or Tremor Raw (copy-paste, standard Tailwind styling, no proprietary tokens) — Tremor Raw is characterized as "the actively developed version" post-acquisition — [search-roundup synthesis, no single primary doc URL isolated for this exact comparative framing — treat with moderate confidence].
- Reception/complaints found (pre-acquisition, from a 2020-era Hacker News thread, so dated but illustrative of a recurring theme): developers found Tremor's custom Tailwind class-prefixing implementation confusing, cited files with 500+ lines just to add the Tremor prefix to existing Tailwind classes, and found API choices like `maxWidth="max-w-sm"` to be "a worse abstraction" than plain Tailwind — and some reported the original Tremor components were "not very extensible using standard Tailwind classes despite being built on Tailwind" — [Hacker News thread](https://news.ycombinator.com/item?id=33148215). This specific complaint predates Tremor Raw, which appears designed explicitly to resolve exactly this friction (plain Tailwind, no custom tokens).

### Inferences
- Tremor Raw's existence is best read as a direct response to the "Tailwind lock-in" complaint about the original `@tremor/react` — moving to a shadcn-style copy-paste-plain-Tailwind model removes the custom design-token abstraction that drew the earliest criticism.
- The Vercel acquisition substantially de-risks "is this maintained" concerns relative to a bootstrapped/YC startup-backed project (Tremor is YC-backed per [Y Combinator company page](https://www.ycombinator.com/companies/tremor)) — but it also means Tremor's roadmap is now presumably subordinated to Vercel's own product priorities (v0, Vercel Dashboard) rather than Tremor being a freestanding charting product; this is an inference, not a confirmed roadmap statement.
- That Tremor Raw's charts are themselves built on Recharts means Tremor/Tremor Raw do not solve Recharts' underlying large-dataset/re-render performance characteristics documented above — Tremor is a styling/composition layer on top of Recharts, not an independent rendering engine, for charts specifically.

### Gaps
- The `tremorlabs/tremor-raw` GitHub repo returned only 3 stars and a stub-like profile via the API, which strongly suggests Tremor Raw's actual source lives in a different repo (possibly merged into `tremorlabs/tremor` itself, or hosted via the raw.tremor.so docs site with its own separate, more active repo not identified by name here) — could not resolve the correct canonical repo for Tremor Raw within budget; a report writer should flag this as unresolved and re-verify Tremor Raw's real star count/activity before publishing a number.
- No post-acquisition (2025-2026) Reddit/HN thread specifically evaluating Tremor's reception *after* becoming Vercel-owned and free was found — the Tailwind-lock-in complaint evidence found is pre-acquisition and about the original paid/commercial-adjacent Tremor, not confirmed as still-current against Tremor Raw.

---

## Unovis: positioning and reception as a newer, framework-agnostic entrant

### Takeaway
Unovis (maintained by F5 Networks, open-sourced after 3+ years of internal use powering F5 Distributed Cloud console and NGINX Controller UIs) positions itself as a modular, framework-agnostic ("write once, render in React/Vue/Angular/Svelte/vanilla TS") dataviz framework that separates data logic from visual logic — reception is mixed: praised for solving bundle bloat via tree-shakeable modular components, but criticized (notably on Hacker News) as feeling like an Angular-first library with other framework bindings "bolted on," with niche, limited mainstream adoption so far relative to D3/ECharts.

### Cited Findings
- `f5/unovis` has 2,857 stars, Apache-2.0 license, 111 open issues, and was pushed 2026‑10‑02 — the most recently active repo of the whole set as of research date — [GitHub repo](https://github.com/f5/unovis).
- Official framing: "Modular data visualization framework for React, Angular, Svelte, Vue, and vanilla TypeScript or JavaScript" — core logic lives in `@unovis/ts`, with thin framework-specific wrapper packages — [GitHub description](https://github.com/f5/unovis), [unovis.dev intro docs](https://unovis.dev/docs/intro/).
- Unovis separates data logic from visual logic, is described as lightweight and tree-shakable with individual component imports, relies on CSS variables for styling (including easy dark-mode support), and works well with TypeScript — [LogRocket: Exploring data visualization with Unovis](https://blog.logrocket.com/exploring-data-visualization-unovis/).
- Production pedigree: Unovis was used for 3+ years internally at F5 before open-sourcing, powering the F5 Distributed Cloud console and NGINX Controller UIs with both Angular and React — [Hacker News discussion of the launch](https://news.ycombinator.com/item?id=33959591).
- Hacker News criticism at launch: commenters noted the library's core value proposition (multi-framework support) "appears to be more of a coding exercise than a production library," with significant effort spent on boilerplate/packaging rather than new features, and that the examples suggested it was primarily an Angular library with other framework bindings added as an afterthought — likely limiting adoption outside the Angular community — [Hacker News item 33959591](https://news.ycombinator.com/item?id=33959591).
- 2026 reviews are more favorable on the specific "bloat" angle: Unovis is praised for solving the common bundle-bloat problem other chart libraries have via its modular architecture — [Weavelinx Vue chart libraries 2026 roundup](https://weavelinx.com/blog/best-chart-libraries-for-vue-projects-in-2026/).
- Overall adoption assessment from search synthesis: Unovis shows "professional adoption" (via F5's own products) but "remains a niche tool with relatively limited mainstream adoption compared to established alternatives like D3.js or ECharts" — this specific framing is a search-tool synthesis rather than a directly quoted primary source, so treat as moderate-confidence secondary characterization.

### Inferences
- Unovis's architecture choice (shared core data/scale logic in `@unovis/ts`, thin per-framework rendering wrappers) is a meaningfully different approach from every other library in this set except Chartkick (which wraps whole chart libraries rather than sharing a data-layer core) — it's the only entrant here genuinely designed from the ground up for multi-framework parity rather than React-first with ports.
- The Hacker News "Angular-first, bolted on" critique and F5's own heavy Angular usage (NGINX Controller, F5 Distributed Cloud) are consistent with each other — F5's own internal usage pattern plausibly explains why early examples/polish skewed Angular, even though React support exists and is maintained.

### Gaps
- No recent (2025-2026) r/reactjs-specific thread discussing Unovis adoption from a React-developer perspective was found — most available commentary is either the 2022-era HN launch thread or Vue/Angular-centric 2026 roundups, so React-specific developer sentiment is thinner than for the other six libraries. This should be flagged as a real evidence gap for the React-focused part of this landscape report.
- Could not find bundle-size (Bundlephobia-style) numbers specifically for `@unovis/react` to compare against visx/Recharts/Nivo figures above.

---

## Chartkick: real niche and limitations as a Ruby/Rails multi-backend wrapper

### Takeaway
Chartkick's niche is "one line of Ruby/ERB to get a decent-looking chart," by generating thin wrapper calls around Chart.js (default since v2), Google Charts, or Highcharts — it deliberately trades deep customization and interactivity for near-zero setup, has a tiny, low-churn issue backlog consistent with a mature/stable utility gem, and is maintained by Andrew Kane, a prolific single maintainer of many Ruby gems (pattern consistent with his other projects, though a direct citation naming him as maintainer of other specific gems was not independently re-verified here).

### Cited Findings
- `ankane/chartkick` has 6,528 stars, MIT license, and only 7 open issues as of Oct 2026 (last pushed 2025‑08‑15/2026-08-15 per API) — an unusually small open-issue count relative to its star count, consistent with a small, stable, slow-moving surface area rather than high community friction — [GitHub repo](https://github.com/ankane/chartkick).
- Chartkick is "a wrapper for several of the most popular open-source chart libraries" — specifically Chart.js (default adapter since v2.0), Google Charts, and Highcharts — exposing a Ruby API (`line_chart`, `pie_chart`, `column_chart`, etc.) that accepts raw data arrays or ActiveRecord query results directly, hiding the underlying JS library's verbose API behind a clean Ruby/ERB interface — [search synthesis of RubyDoc README](https://www.rubydoc.info/gems/chartkick/5.1.1) and [SitePoint: Make Easy Graphs and Charts on Rails with Chartkick](https://www.sitepoint.com/make-easy-graphs-and-charts-on-rails-with-chartkick/).
- Supported chart types include line, area, bar/column, pie, scatter, geo charts, and timeline; it integrates with multiple JS build systems (Importmap, Webpack, esbuild) — [search synthesis], [Ruby Toolbox project page](https://www.ruby-toolbox.com/projects/chartkick).
- Customization is explicitly limited by design: "react-chartkick prioritizes simplicity, which means it limits customization... Chart.js offers users more control over customization and styling, [while] React Chartkick is more focused on simplicity and ease of use" — [StackShare comparison synthesis](https://stackshare.io/stackups/js-chart-vs-react-chartkick).
- A concrete, dated limitation example: fixing Y-axis label formatting in Chartkick under Rails 7 required manual workarounds, and passing custom JS functions (e.g., formatter callbacks) through Rails' ERB templates requires using Rails' `raw()` helper to prevent Rails from HTML-escaping the embedded JavaScript — a friction point specific to the Ruby/Rails + JS-interop bridge Chartkick straddles — [Medium: Fixing Chartkick Y-Axis Label Formatter Issues in Rails 7](https://medium.com/@python-javascript-php-html-css/fixing-chartkick-y-axis-label-formatter-issues-in-rails-7-c5fd08be29c5).
- Documentation/community-resource depth is smaller than the underlying libraries it wraps: "Chart.js has been around longer and has a larger community base with extensive documentation and support, while React Chartkick, being a wrapper library, may have slightly fewer resources" — [search synthesis, StackShare-style comparison].
- Praise: Chartkick (and its React port, react-chartkick) is "notably beginner-friendly due to [its] straightforward API and minimal configuration needs" — [search synthesis].

### Inferences
- Chartkick's real niche is emphatically backend/full-stack-Rails developers who want a chart with minimal JS authored by hand — it is not a competitor to the React-native libraries above in any direct sense; it is a code-generation/convenience layer that defers all actual rendering, animation, and performance characteristics to whichever backend (Chart.js/Highcharts/Google Charts) is selected. This means Chartkick inherits Chart.js's/Highcharts'/Google Charts' own large-dataset performance profile rather than having one of its own.
- The low open-issue count (7) relative to 6,528 stars, combined with regular pushes through Aug 2026, suggests this is a feature-complete, low-maintenance-burden utility gem rather than an actively evolving platform — consistent with "thin wrapper, niche is done" rather than "actively expanding scope."
- The limitation that lands hardest in practice is the one found concretely (Rails/JS interop friction for callback-heavy customizations like axis formatters) — this is the most specific, sourced evidence of Chartkick's "ceiling" among what was found.

### Gaps
- Could not independently verify Andrew Kane's maintainer attribution or his track record with other Ruby gems via a primary source within budget — this claim is pattern-matched from general knowledge of the Ruby ecosystem rather than a cited search result, and should either be re-verified or dropped/softened by the report writer.
- No GitHub-issue-level evidence of specific *performance* complaints about Chartkick was found — this is expected given it's a thin wrapper (performance would manifest as the underlying Chart.js/Highcharts/Google Charts library's own issue, not Chartkick's), but it means the "performance characteristics" dimension of the assignment's objective is effectively "inherited, not independent" for this library, and no further performance-specific sourcing was pursued given that architectural reality.

---

## Cross-cutting notes for the report writer (not a key question, but relevant to synthesis)

- **Architecture spectrum**, from most declarative/ready-made to most low-level: Chartkick (full chart, zero JS authored) → Tremor (`@tremor/react`, styled ready-made components) → Recharts/Nivo/Victory (declarative React components, SVG-based, built on D3 math internally) → Unovis (modular, framework-agnostic core + thin renderer) → Tremor Raw (copy-paste primitives + Recharts underneath) → visx (lowest-level, pure primitives, D3-powered, build-your-own-chart). This spectrum directly answers the "declarative components vs. headless primitives" axis from the objective.
- **Rendering surface**: all of Recharts, Nivo (primarily), Victory (web), and visx are SVG-based; Nivo additionally offers a Canvas mode for some chart types (e.g., `nivo.rocks/bar/canvas`) aimed at higher point counts; Victory Native (React Native only) uses GPU Canvas via Skia, a categorically different and more performant rendering path than any of the SVG-based web libraries; Unovis's rendering approach per-framework was not fully characterized in this research pass (gap).
- **License caveat**: Victory's GitHub API license field returned `NOASSERTION` — this needs manual verification against the actual LICENSE file before the report states a definitive license for Victory.
- **Biggest unresolved cross-library gap**: a single consistent, recent (2025-2026), primary-sourced Bundlephobia measurement set for all seven libraries side-by-side was not obtained — all bundle-size figures above come from secondary blog/aggregator sources that disagree with each other by wide margins (e.g., Nivo cited as both ~389kB and 500kB+ minified, and ~82kB vs ~285kB+ gzipped in different sources). The report writer should treat every bundle-size figure in this document as directionally indicative only, not precise, and ideally re-verify against bundlephobia.com directly if precision matters.
