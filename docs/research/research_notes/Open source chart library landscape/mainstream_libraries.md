# Mainstream, Ease-of-Use-Focused Open-Source Charting Libraries (Chart.js, ApexCharts, Billboard.js, Chartist.js, Frappe Charts, Google Charts)

## Chart.js — profile, customization pain, and ecosystem sentiment

### Takeaway
Chart.js is the dominant "easy default" canvas-based charting library (67.7k GitHub stars, MIT, actively maintained with a release in Oct 2025 and commits as recent as Oct 2026), but its canvas-only architecture and plugin system are the recurring source of friction once teams need anything beyond the ~8 built-in chart types or deep per-element styling — confirming the "easy to start, hard to deeply customize" reputation.

### Cited Findings
- Repo stats (GitHub API, checked 2026-10-03): 67,730 stars, 592 open issues, not archived, MIT license, last push 2026-10-03, latest tagged release v4.5.1 published 2025-10-13 — actively maintained. — [chartjs/Chart.js](https://github.com/chartjs/Chart.js)
- Architecture: imperative/config-object API rendering to `<canvas>` (immediate-mode bitmap), not SVG — this is the root cause of several downstream complaints (no per-element DOM nodes to style/animate with CSS, no native accessible structure). — [Chart.js docs](https://www.chartjs.org/docs/latest/general/accessibility.html)
- Canvas content is not accessible to screen readers by default: "Canvas content will not be accessible to screen readers... a canvas is one image with no internal structure to read." Chart.js's own docs put the burden on the developer to add `role`, `aria-label`, and fallback content inside the `<canvas>` tags, or build an offscreen data table. — [Chart.js Accessibility docs](https://www.chartjs.org/docs/latest/general/accessibility.html); open feature-request issue tracked at [chartjs/Chart.js#10450 "Support screen reader to read graph label and content"](https://github.com/chartjs/Chart.js/issues/10450) and earlier [chartjs/Chart.js#3970 "Accessibility Feature Request"](https://github.com/chartjs/Chart.js/issues/3970) and [chartjs/Chart.js#1976 "Accessibility support: keyboard navigation"](https://github.com/chartjs/Chart.js/issues/1976) — these remain open, indicating a11y is still not solved natively years after being requested.
- Because canvas output is an opaque bitmap, it also has no SEO value — search engines can't extract chart content unless the developer manually adds a text alternative. — [synthesized from Chart.js accessibility docs](https://www.chartjs.org/docs/latest/general/accessibility.html)
- Plugin-system complaints are a recurring GitHub issue theme: TypeScript module augmentation for plugin options breaks depending on import order ([chartjs/Chart.js#11288](https://github.com/chartjs/Chart.js/issues/11288)); plugins register globally and apply to *all* chart instances regardless of per-chart configuration, contrary to developer expectations ([chartjs/Chart.js#7963 "Plugins are applied to all Chart instances regardless configuration"](https://github.com/chartjs/Chart.js/issues/7963)); plugin options typing is reported as convoluted ([chartjs/Chart.js#8051](https://github.com/chartjs/Chart.js/issues/8051)); and on the widely-used `chartjs-plugin-annotation` a maintainer/user describes the type management as "terrible" with "stupidly long and hard to read" type errors ([chartjs/chartjs-plugin-annotation#873](https://github.com/chartjs/chartjs-plugin-annotation/issues/873)).
- Chart-type coverage is deliberately narrow (bar, line, area, pie/doughnut, bubble, radar, polar area, scatter — 8 types). Anything outside that list (Sankey, gauge/speedometer) is not core — it requires third-party plugins such as `chartjs-chart-sankey` ([kurkle/chartjs-chart-sankey](https://github.com/kurkle/chartjs-chart-sankey)) or `chartjs-gauge`/`chartjs-gauge-v3` ([haiiaaa/chartjs-gauge](https://github.com/haiiaaa/chartjs-gauge)), which are community-maintained outside the core project and carry their own compatibility lag (e.g., forks needed per major Chart.js version).
- Bundle size: ~67 KB min+gzip per search-aggregated bundlephobia-style figures (exact figure varies by build/tree-shaking choices). — [bundle-size comparison search aggregation, 2026](https://npm-compare.com/chart.js,echarts,victory-chart,chartist,recharts,billboard.js,apexcharts)
- A third-party "Accessibility Audit: 10 JavaScript Chart Libraries (2026)" exists (published by a competitor, ApexCharts) specifically benchmarking Chart.js and peers on a11y — worth having the report-writer treat with some skepticism given the source is a competing vendor, but it corroborates that a11y is an industry-wide differentiator question in 2026. — [ApexCharts blog: Accessibility Audit](https://apexcharts.com/blog/charting-library-accessibility-audit/)

### Inferences
- Chart.js's "easy to start" reputation is structural: a small, fixed chart-type vocabulary and canvas-only rendering keep the API surface small and predictable for the 80% case (dashboards, blog posts, simple admin panels), but the same choices (immediate-mode canvas, global plugin registration) are exactly what makes deep customization, accessibility, and exotic chart types painful — these are flip sides of the same architectural decision, not independent problems.
- The fact that core maintainers still have open, multi-year-old a11y issues (#3970 from years ago, #10450, #1976) suggests accessibility is treated as a "bring your own" concern rather than a roadmap priority, consistent with "canvas charts are not SEO/a11y-friendly out of the box" being a durable, well-known limitation rather than a fixable bug.

### Gaps
- Could not find a specific, well-sourced count of "lines of code for a basic bar/line chart" in Chart.js from an authoritative or widely-cited source (most comparison posts show sample code snippets but don't quantify LOC consistently); this metric is better assessed directly from Chart.js's own quickstart docs than inferred from search snippets.
- No concrete, recent (2025–2026) large-dataset performance benchmark numbers (e.g., render time at 100k points) were found in search snippets — general claims exist that canvas performs well at scale compared to SVG DOM-heavy libraries, but no citable benchmark was located in this pass.
- Could not find a specific Reddit (r/javascript) thread with upvoted comments about desired Chart.js chart types; only GitHub plugin ecosystem evidence (Sankey/gauge as plugins) was found as a proxy for "missing chart types people build workarounds for."

---

## ApexCharts — architecture, React/SSR experience, and licensing/governance

### Takeaway
ApexCharts is a modern, SVG-based charting library (15.2k stars) actively developed with a release as recent as 2026-10-02, well regarded for attractive out-of-the-box styling and officially-maintained React/Vue/Angular wrappers, but it quietly moved to a dual "Community/Commercial" revenue-gated license controlled by a single commercial entity (Apex Software, Inc., a subsidiary of Infragistics) — a real governance/licensing concern that goes beyond a simple permissive OSS license, and its React wrapper has known, unresolved SSR ("window is not defined") friction with Next.js.

### Cited Findings
- Repo stats (GitHub API, checked 2026-10-03): 15,168 stars, 300 open issues, not archived, latest release v7.8.0 published 2026-10-02 — actively maintained; GitHub reports the repo license field as **`NOASSERTION`** (i.e., GitHub's license detector could not match the repo's license to a standard SPDX license), which is consistent with the custom commercial license terms described below rather than plain MIT. — [apexcharts/apexcharts.js](https://github.com/apexcharts/apexcharts.js)
- Licensing model: ApexCharts is "provided by Apex Software, Inc., a wholly owned subsidiary of Infragistics, Inc." It uses a dual license: a free "Community License" for organizations under **$2 million USD** in annual revenue/operating budget/funding (including parent companies and affiliates), and a paid Commercial License (~$199/developer/year) required once that threshold is crossed. — [ApexCharts Community License](https://apexcharts.com/license/community/), [ApexCharts Commercial License](https://apexcharts.com/license/commercial/), [ApexCharts "New Licensing Model" blog post](https://apexcharts.com/blog/new-licencing-model/)
- Community License restrictions found: cannot build competing products/services with it; cannot remove attribution or relicense; must keep copyright/license notices intact; redistribution (e.g., bundling into an SDK, no-code tool, or dashboard builder you resell) is **not permitted** under Community or standard Commercial Developer License — a separate, presumably paid, OEM/Redistribution License is required for that. — [ApexCharts OEM / Redistribution License](https://apexcharts.com/license/oem/), [search synthesis citing community restrictions](https://apexcharts.com/license/community/)
- A community-sourced claim (unverified, from a forum) states some open-source projects "had to remove ApexCharts due to redistribution licensing requirements being expensive" — flagged as lower-confidence since the primary forum thread wasn't directly fetched. — [b4x.com forum thread "ApexChart Licensing & Whats Next?"](https://www.b4x.com/android/forum/threads/sithasodaisy5-apexchart-licensing-whats-next.171080/)
- SSR/Next.js friction: the core reported failure mode is `ReferenceError: window is not defined` when apexcharts/react-apexcharts code runs during Next.js server rendering, because the library has top-level references to `window`. Open/closed GitHub issues document this repeatedly: [react-apexcharts#305 "Next.js doesn't work with apexcharts"](https://github.com/apexcharts/react-apexcharts/issues/305), [apexcharts.js#3703 "Support SSR"](https://github.com/apexcharts/apexcharts.js/issues/3703), [apexcharts.js#4288 "Add SSR Support"](https://github.com/apexcharts/apexcharts.js/issues/4288), [react-apexcharts#358 "Using apexcharts with storybook and nextjs"](https://github.com/apexcharts/react-apexcharts/issues/358). Official guidance is to mark the component `'use client'` or use Next's `dynamic(..., { ssr: false })` — i.e., SSR is not natively supported and must be worked around by the app developer. — [ApexCharts official Next.js integration docs](https://apexcharts.com/docs/nextjs-integration/)
- A related wrapper quality complaint: updating state on one chart instance can cause re-renders of *other* unrelated chart instances. — [react-apexcharts#336 "Updating State of one chart re-render all charts"](https://github.com/apexcharts/react-apexcharts/issues/336)
- Praise (from maintainer-highlighted testimonials on the project's own site/README, so treat as self-selected but still indicative of real user sentiment): "I absolutely love ApexCharts!"; "I'm loving your library, really saved me in our project... the freedom of customization is awesome"; "huge respect for your amazing library! So in love with the simplicity & feature richness!" — [apexcharts.com homepage / embeddable.com blog aggregation](https://embeddable.com/blog/build-dashboards-with-apexcharts)
- Official wrappers exist for React, Vue, and Angular, and are generally described as integrating "cleanly"/"natively" with each framework's component model. — [search synthesis, LogRocket "Charting in React with ApexCharts"](https://blog.logrocket.com/charting-react-apexcharts/)
- Bundle size: ~164 KB min+gzip, substantially larger than Chart.js (~67 KB) — a direct trade-off for ApexCharts' richer built-in feature set (zoom, pan, export to SVG/PNG/CSV, annotations) shipped by default rather than as opt-in plugins. — [bundle size comparison aggregation](https://npm-compare.com/chart.js,echarts,victory-chart,chartist,recharts,billboard.js,apexcharts)
- Architecture: declarative options-object API, SVG rendering (not canvas) — this is why DOM-level styling/animation and crisper vector output are possible, unlike Chart.js. — [apexcharts/apexcharts.js GitHub description: "Interactive JavaScript Charts built on SVG"](https://github.com/apexcharts/apexcharts.js)

### Inferences
- The shift from (what was historically perceived as) a permissive MIT-style open-source library to a revenue-gated dual license is a meaningful governance change that most "best chart library" roundup posts from before ~2024 would not reflect — anyone citing ApexCharts as simply "free and open source" without checking the current license terms would be giving outdated information as of 2026.
- ApexCharts' SSR issues are a known, chronic category (multiple issues spanning apexcharts.js and react-apexcharts repos, several still open) rather than a one-off bug — teams adopting it in Next.js/Remix/SvelteKit SSR contexts should expect to budget time for `dynamic import`/`ssr:false` workarounds.

### Gaps
- Could not directly verify from a maintainer/official source *when* the licensing model changed from a presumably simpler open license to the current Community/Commercial model, nor confirm the exact prior license — the "New Licensing Model" blog post exists but was not fetched in full; this should be verified before stating a specific transition date in the final report.
- Could not find a large, independent (non-vendor-affiliated) sample of Reddit/HN comments specifically reacting to the ApexCharts licensing change; the forum complaint found is a single, low-traffic thread and should be weighted accordingly.

---

## Billboard.js — niche, architecture, and maintenance status

### Takeaway
Billboard.js (naver/billboard.js, 6,014 stars) is a D3-based SVG chart library and the maintained spiritual successor to the now-archived C3.js, positioned for teams who want a simple, C3-like declarative API without C3's stale/abandoned dependency chain — it is clearly actively maintained in 2026 (commits same-day as this research, a release on 2026-09-30), making it a legitimate, non-abandoned niche pick, not a "mostly dead" alternative.

### Cited Findings
- Repo stats (GitHub API, checked 2026-10-03): 6,014 stars, 149 open issues, not archived, MIT license, last push 2026-10-03, latest tagged release 4.1.1 published 2026-09-30, npm `billboard.js` at version 4.1.1 matching that same timestamp — actively maintained, not abandoned. — [naver/billboard.js](https://github.com/naver/billboard.js)
- Positioning: "a D3-based SVG chart library and drop-in successor to the (now archived) C3.js... useful when you want C3's simple API without C3's stale dependencies." — [search synthesis of comparison posts](https://github.com/naver/billboard.js/wiki/Comparison-table)
- Architecture: built on top of D3.js (v4+), SVG rendering; described in some sources as also supporting Canvas rendering in certain modes. — [search synthesis](https://naver.github.io/billboard.js/)
- Performance characterization (general, not independently benchmarked in this pass): "leverages D3.js for rendering, providing good performance for moderate datasets, however performance may degrade with very large datasets due to D3's rendering approach" — this is a secondary/aggregator claim, not a primary benchmark, and should be treated as a plausible but unverified generalization about D3-based SVG libraries.
- Learning curve noted as "relatively easy... especially for those familiar with D3.js, but may require some understanding of D3 concepts for advanced customization" — i.e., Billboard.js smooths over D3's raw complexity for standard charts but customization beyond its API still benefits from D3 familiarity.
- Bundle size: search aggregation could not surface a confident bundlephobia figure for billboard.js ("n/a — bundlephobia could not size it" in the comparison search), so no reliable min+gzip number was found in this pass. — [bundle comparison search](https://npm-compare.com/chart.js,echarts,victory-chart,chartist,recharts,billboard.js,apexcharts)

### Inferences
- Billboard.js's niche is specifically teams migrating off C3.js (which is archived/dead) who want API continuity rather than teams evaluating chart libraries from scratch — its value proposition is "C3 that still gets updates," not "best general-purpose chart library."
- Given commits on the exact day of this research and a release four days prior, Billboard.js should be classified as actively maintained in 2026, correcting any assumption that smaller D3-based libraries are automatically semi-abandoned.

### Gaps
- No reliable, independently-sourced bundle size (min+gzip) figure was found for Billboard.js in this research pass.
- No concrete GitHub issue or Reddit/HN thread quoting specific user complaints about Billboard.js was found — the praise/complaint picture for this library is thinner than for Chart.js/ApexCharts and should be flagged to the report writer as a relative evidence gap (most "chart library 2025/2026 comparison" posts mention Billboard.js only briefly).
- No specific accessibility (a11y) or mobile/touch support documentation was found for Billboard.js in this pass.

---

## Chartist.js — niche, maintenance status, and the "abandoned original vs. active fork" nuance

### Takeaway
Chartist.js has a confusing maintenance story that matters a lot for a 2026 report: the original repo (`gionkunz/chartist-js`) is explicitly marked by its own owner as a **legacy repo** (down to 95 stars, effectively abandoned), while the project was transferred to a community organization, `chartist-js/chartist`, which is actively maintained (13,389 stars, commits same-day as this research, an npm release from 2025-09-30) — so "is Chartist abandoned?" depends entirely on which repo you're looking at.

### Cited Findings
- `gionkunz/chartist-js` GitHub API (checked 2026-10-03): only 95 stars, and the repo itself is now titled "Legacy Chartist Repo for old gh-pages" — i.e., the original maintainer has explicitly stepped back and repositioned this repo as legacy/documentation-only. — [gionkunz/chartist-js](https://github.com/gionkunz/chartist-js)
- The current, maintained repo is `chartist-js/chartist`: GitHub API (checked 2026-10-03) shows 13,389 stars, 252 open issues, MIT license, not archived, last push 2026-10-03 (same day as this research) — i.e., genuinely active. — [chartist-js/chartist](https://github.com/chartist-js/chartist)
- npm package `chartist` is at version 1.5.0, last modified 2025-09-30 — consistent with the community fork being the one actually publishing releases. — [npm chartist package metadata, checked via `npm view`]
- Bundle size: ~11.49 KB min+gzip (and separately cited as "~10KB gzip, no dependencies") — Chartist remains one of the smallest options in this set. — [bundle comparison search aggregation](https://npm-compare.com/chart.js,echarts,victory-chart,chartist,recharts,billboard.js,apexcharts)
- Architecture: SVG-based, "Simple responsive charts" is the project's own tagline — positioned explicitly around simplicity and responsiveness rather than feature breadth. — [chartist-js/chartist GitHub description](https://github.com/chartist-js/chartist)

### Inferences
- Any 2026 report or blog post that cites "Chartist.js" star counts, release dates, or maintenance status without specifying which repo (`gionkunz/chartist-js` vs. `chartist-js/chartist`) is likely to be wrong or misleading — this is a trap for secondary sources, and the report should explicitly flag the fork/transfer so readers checking GitHub themselves aren't confused by the legacy repo's low star count.
- Chartist's niche is unapologetically "small, simple, responsive SVG charts" for teams that don't need rich interactivity (tooltips/zoom/export are comparatively bare) and prioritize minimal footprint — it's positioned below Chart.js in both bundle size and feature ambition.

### Gaps
- No specific GitHub issues or community discussion was fetched describing *why* or *when* the gionkunz→chartist-js org transfer happened (only the end-state labeling "Legacy Chartist Repo" was found) — the precise transfer narrative/date is a gap.
- No concrete complaint threads (Reddit/SO) about Chartist were found in this pass; evidence base for praise/complaints is thin and should be flagged as such.

---

## Frappe Charts — niche, maintenance status, and 2026 outlook

### Takeaway
Frappe Charts (15,087 stars) is a "simple, responsive, modern SVG chart library with zero dependencies" built originally for ERPNext's internal dashboard needs, and it shows clear signs of being in low-activity/maintenance-mode by 2026: its last tagged GitHub release was in **April 2022**, and while the GitHub repo itself shows a push as recent as **July 2025**, that is still well over a year stale relative to this research date (October 2026), and npm hasn't seen a new version published since mid-2025.

### Cited Findings
- Repo stats (GitHub API, checked 2026-10-03): 15,087 stars, 147 open issues, MIT license, not archived, last push 2025-07-02 — i.e., over 15 months without a new commit as of this research date. — [frappe/charts](https://github.com/frappe/charts)
- Latest tagged release: v1.6.3, published 2022-04-27 — over four years old relative to this research date. — [frappe/charts releases, GitHub API]
- npm package `frappe-charts`: version 1.6.2 (note: lower than the 1.6.3 git tag, suggesting the 1.6.3 tag was never published to npm), last modified 2025-07-02. — [npm frappe-charts package metadata, checked via `npm view`]
- Origin/use case: created for ERPNext's need for "a simple sales history graph for its user company master"; the team found existing libraries (e.g., C3.js) either visually misaligned with their product's design or "too complex or rigid," motivating a purpose-built, minimal library. — [frappe/charts GitHub description](https://github.com/frappe/charts), [search synthesis]
- Chart-type coverage: Axis Charts (bar/line mixed), Area/Trends, Bar, Line, Pie, Percentage, Mixed-Axis, Heatmap. — [Frappe Charts docs](https://frappe.io/charts/docs)
- It continues to be used/integrated within the broader Frappe ecosystem (e.g., `frappe/insights` BI tool, `frappe/crm`), suggesting it's maintained indirectly as an internal dependency of Frappe's own products even if the standalone OSS repo sees infrequent standalone releases. — [frappe/insights PR #1383](https://github.com/frappe/insights/pull/1383), [frappe/crm PR #2966](https://github.com/frappe/crm/pull/2966)
- Bundle size: ~17.6 KB min+gzip (also cited elsewhere as "roughly 15k gzipped") — a lightweight option, comparable to or slightly larger than Chartist. — [bundle comparison search aggregation](https://npm-compare.com/chart.js,echarts,victory-chart,chartist,recharts,billboard.js,apexcharts)

### Inferences
- Frappe Charts should be flagged in the final report as **semi-abandoned as an independently-released OSS package** (4+ years since last tagged release, 15+ months since last commit as of Oct 2026) even though it isn't formally archived and still gets occasional internal use inside Frappe's own product suite — it's a reasonable pick only for teams that accept "no active standalone roadmap" and value its small size/zero-dependency SVG simplicity for ERPNext-style dashboards specifically.
- Its niche is narrow: simple business-dashboard charts (sales trends, heatmaps à la GitHub's contribution graph) for teams already in the Frappe/ERPNext ecosystem or wanting a very small zero-dependency SVG library, not a general-purpose charting solution.

### Gaps
- Could not find specific GitHub issues or Reddit/HN threads with concrete user complaints about Frappe Charts (the 147 open issues figure is known, but individual issue content wasn't sampled in this pass) — praise/complaint theme extraction for this library is weak and should be flagged as low-confidence/thin evidence to the report writer.
- Could not confirm current maintainer intent (i.e., whether Frappe has stated this is intentionally in maintenance mode vs. simply under-resourced) from a primary source.

---

## Google Charts — licensing/hosting model and "not a good OSS citizen" critique

### Takeaway
Google Charts is **not open source in the npm-package sense** — it is a proprietary, Google-hosted library loaded at runtime from Google's `gstatic.com` CDN via `google.charts.load()`, and Google's terms explicitly forbid downloading/self-hosting that code, which is the core of the "not a good open-source citizen" critique: no self-hosting, hard CDN dependency, and real historical precedent (the 2019 shutdown of the related Google Image Charts API) for why that dependency is risky.

### Cited Findings
- Self-hosting is explicitly disallowed: "Google's terms of service do not allow you to download and host the `google.charts.load` or `google.visualization` code for offline or self-hosted use. Your users' computers must have access to `https://www.gstatic.com/charts/loader.js`..." — [Google Charts FAQ](https://developers.google.com/chart/interactive/faq)
- "Google Charts software is proprietary" per search-synthesized sourcing, though a separate, narrower open-source subset exists: `google/google-visualization` on GitHub and `GoogleWebComponents/google-chart` (Apache-2.0 licensed web components wrapping the Google Charts API) are open source, but they still ultimately depend on Google's hosted/loaded backend rather than being fully self-contained. — [google/google-visualization](https://github.com/google/google-visualization), [GoogleWebComponents/google-chart](https://github.com/GoogleWebComponents/google-chart)
- There is a separate, now-**archived** `google/google-visualization-issues` GitHub repo (283 stars, 2,273 open issues at time of archiving, last pushed 2015-05-09) that was apparently Google's public issue tracker for the Google Visualization/Charts API — its archived status and large stale open-issue backlog (2,273 issues frozen since 2015) is itself a strong, concrete signal of how Google has historically under-invested in public-facing OSS-style community support for this product. — [google/google-visualization-issues](https://github.com/google/google-visualization-issues)
- Historical precedent for CDN/hosting lock-in risk: "the Google Image Charts API shut down on March 14, 2019, and although it was deprecated since 2012, the shutdown disappointed many developers" — cited by developers as a concrete reason to prefer self-hostable open-source alternatives over Google-hosted charting APIs. — [search synthesis referencing Google Image Charts shutdown](https://www.ianww.com/blog/2019/03/05/a-replacement-for-the-google-image-charts-api/)
- Internet-dependency is a functional limitation, not just a philosophical OSS objection: "Google Charts requires an internet connection to fetch the library" and "static charts cannot be easily generated without an internet connection," limiting offline/air-gapped use. — [search synthesis]

### Inferences
- The "not a good open-source citizen" framing is justified on concrete, checkable grounds (ToS forbids self-hosting; archived issue tracker with thousands of unresolved issues frozen for over a decade; proven precedent of Google discontinuing a sibling charting API outright) rather than being merely a stylistic complaint — this should be reported as a substantive governance/risk concern, not just a licensing technicality.
- Teams choosing Google Charts are implicitly accepting a dependency relationship more like "consuming a Google product" than "adopting an open-source library," even though parts of the ecosystem (web-component wrappers) carry OSI-approved licenses — the core rendering/data-visualization code itself is not something you can vendor, audit fully, or run offline.

### Gaps
- Could not find the exact current license text/terms for the core Google Charts JS library itself (as opposed to the wrapper projects) in this pass — the Google Charts FAQ confirms the self-hosting restriction but a full license determination (e.g., is it under Google's general API Terms of Service rather than a software license at all?) would benefit from directly reading https://developers.google.com/chart/interactive/faq and Google's API Terms of Service in a follow-up pass.
- No recent (2025–2026) Hacker News thread specifically about Google Charts' OSS status was found in this pass; the HN link surfaced in search results was tangential (a generic comment about Google backends being proprietary) rather than a dedicated discussion thread about Google Charts.

---

## Cross-cutting data not fully captured above (for report-writer convenience)

### Takeaway
Bundle size and maintenance-status figures collected across all six libraries, consolidated here since they were gathered via comparative searches rather than one-per-library.

### Cited Findings
- Approximate bundle sizes (min+gzip), from a single comparative aggregation search — treat as directionally correct but not pinpoint-precise, since exact figures depend on build/tree-shaking: Chart.js ≈ 67 KB; ApexCharts ≈ 164 KB; Chartist ≈ 11.5 KB; Frappe Charts ≈ 17.6 KB; Billboard.js size could not be confidently determined (bundlephobia could not size it in the aggregator used). — [npm-compare.com aggregation](https://npm-compare.com/chart.js,echarts,victory-chart,chartist,recharts,billboard.js,apexcharts)
- Consolidated maintenance snapshot (all GitHub API checks performed 2026-10-03):

  | Library | Repo | Stars | Open issues | License (GitHub-detected) | Last push | Latest release |
  |---|---|---|---|---|---|---|
  | Chart.js | chartjs/Chart.js | 67,730 | 592 | MIT | 2026-10-03 | v4.5.1 (2025-10-13) |
  | ApexCharts | apexcharts/apexcharts.js | 15,168 | 300 | NOASSERTION (custom dual license) | 2026-10-02 | v7.8.0 (2026-10-02) |
  | Billboard.js | naver/billboard.js | 6,014 | 149 | MIT | 2026-10-03 | 4.1.1 (2026-09-30) |
  | Chartist (community fork) | chartist-js/chartist | 13,389 | 252 | MIT | 2026-10-03 | npm 1.5.0 (2025-09-30) |
  | Chartist (original, legacy) | gionkunz/chartist-js | 95 | — | MIT | — (legacy/gh-pages only) | — |
  | Frappe Charts | frappe/charts | 15,087 | 147 | MIT | 2025-07-02 | v1.6.3 (2022-04-27) |
  | Google Charts (community issue tracker) | google/google-visualization-issues | 283 | 2,273 (frozen) | none detected | 2015-05-09 | archived |

  — [all rows from direct GitHub API queries performed during this research, 2026-10-03]

### Inferences
- By simple recency/activity signal, the maintenance-health ranking among these six is: Chart.js and Billboard.js (both committed same-day) > ApexCharts (committed within a day, but now under a commercial dual license, which is a different kind of risk) > Chartist-the-fork (active) > Frappe Charts (stale >1 year, last release 2022 — maintenance mode) > Chartist-the-original (explicitly legacy) > Google Charts proper (not self-hostable OSS at all; its public issue tracker has been archived and frozen since 2015).

### Gaps
- Performance-with-large-datasets benchmarks (concrete numbers like "renders N points in M ms") were not found with primary-source citations for any of the six libraries in this research pass; all performance characterizations found were qualitative/secondary-source claims (e.g., "degrades with very large datasets due to D3's rendering approach" for Billboard.js) and should be labeled as unverified generalizations rather than benchmarked facts.
- API-ergonomics-by-LOC (lines of code for a basic bar/line chart) was not found as a citable, consistent metric across sources for any library; this would need direct inspection of each library's official "quickstart" code sample rather than search-based synthesis, and is flagged as a gap for the report writer to fill via direct doc review if the LOC comparison is essential to the final report.
- Mobile/touch support details were not substantively found for Billboard.js, Chartist, or Frappe Charts in this pass (only general claims that SVG-based libraries are "responsive"); Chart.js and ApexCharts both ship responsive/touch-aware defaults per their own marketing copy, but no independent touch-interaction-specific complaint/praise threads were located for any of the six.
