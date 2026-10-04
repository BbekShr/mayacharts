# Enterprise-Grade / Feature-Rich Charting Libraries: ECharts, Highcharts, amCharts, AntV G2/G2Plot, LightningChart JS, Plotly.js

## Scope note on source bias
Several results in this research were served by `lightningchart.com/blog/*` posts (e.g., "7 Best Highcharts Alternatives In 2026," "Best Apache ECharts Alternative In 2026"). These are vendor marketing content written by a commercial competitor (LightningChart Ltd.) to sell its own product, and their performance/feature claims about rival libraries should be treated as directional, not authoritative — they are flagged explicitly below wherever used.

---

## Q1: What is the precise licensing situation for each library (free vs. commercial), and does it match the assumptions in the brief?

### Takeaway
The brief's assumptions are confirmed: **Highcharts** and **amCharts** are source-viewable/"fair-source"-style commercial products free only for non-commercial/nonprofit/educational use; **LightningChart JS** is a fully commercial product with only a non-commercial "Community" tier (not a true OSS tier); **Apache ECharts** (Apache-2.0) and **AntV G2/G2Plot** (MIT) are genuinely free open source with no commercial restriction; **Plotly.js** is genuinely MIT-licensed OSS, with Plotly's Dash and paid Chart Studio/Plotly Studio offerings sold as separate, optional commercial products built on top of the OSS core.

### Cited Findings

**Highcharts**
- Highcharts requires a paid commercial license for any company project, client work, internship work, consulting engagement, or internal business operations; it is free only for non-commercial purposes under separate terms, for education (schools/universities, coursework, non-funded academic research), and for registered non-profits — [Highcharts License Agreement](https://shop.highcharts.com/license-eula-1.0.pdf), [Highcharts Education](https://www.highcharts.com/education/)
- The current license agreement in effect is version 1.0, dated 20 January 2026, confirming the commercial/non-commercial split is still the operative model in 2026 — [Highcharts License](https://shop.highcharts.com/license)
- Three paid license types exist: **Internal** (internal org use only, no customer-facing deployment), **SaaS** (required for any externally/public-facing software), and **OEM** (for redistributing Highcharts inside a product sold to customers) — [Highcharts License](https://shop.highcharts.com/license)
- Per-developer commercial pricing has been cited at roughly **$185–$366/dev/year** in third-party comparisons, with other sources citing a Developer License at $176/developer annually and a SaaS Developer License at $349/developer; OEM and Enterprise are custom/negotiated — [StackShare echarts vs highcharts comparison](https://stackshare.io/stackups/echarts-vs-highcharts); figures synthesized from search snippets, not independently verified against a single official price sheet — treat as approximate.
- Highcharts is **source-viewable** (you can read/modify the JS) but this is not an OSS license; redistribution/commercial use is gated by the EULA — consistent with the brief's framing.

**amCharts**
- amCharts 5 has **no genuinely free commercial tier**: all commercial implementations require a paid license. A free/non-commercial-linkware model existed historically (amCharts 3/4 era — "free to use anywhere including commercial sites with a small attribution link/logo"), but current amCharts 5 pricing pages describe tiered *paid* licenses with no free-with-watermark path documented on the official pricing page — [amCharts 5 pricing](https://www.amcharts.com/online-store/) (via ComponentSource factsheet: [amCharts 5 Licensing Fact Sheet](https://www.componentsource.com/product/amcharts/factsheet))
- Paid tiers: **Basic** ($80–$180/seat, annual or perpetual) for public non-login websites; **Single App/SaaS** ($280 annual / ~$650 perpetual) for apps requiring login, bundling 12 months support; **OEM** ($1,200–$2,700/seat) for redistributable apps; **Extended OEM** (contact sales) for affiliates/white-label — [amCharts 5 pricing](https://www.amcharts.com/online-store/)
- Separately, some sources describe amCharts' historical model as "linkware" — usable for free including commercially, with a mandatory small amCharts attribution logo in the corner, and a paid license only needed to remove that watermark — [search synthesis, amcharts.com/download](https://www.amcharts.com/download/). **This conflicts somewhat with the ComponentSource/official store page**, which describes no-watermark free tier and only paid seat licenses. The discrepancy likely reflects amCharts 4 (older, had the free+watermark linkware model) vs. amCharts 5 (newer major version, pricing page shown above implies paid-only); this version distinction is a **gap** — could not fully confirm from official amcharts.com license page text directly.
- amCharts GitHub license files exist per-package (e.g., `amcharts4/dist/script/LICENSE`, `amcharts5/packages/shared/LICENSE`) confirming the commercial licensing terms are embedded in the distributed code — [amcharts4 LICENSE](https://github.com/amcharts/amcharts4/blob/master/dist/script/LICENSE), [amcharts5 LICENSE](https://github.com/amcharts/amcharts5/blob/master/packages/shared/LICENSE)

**LightningChart JS**
- LightningChart JS is a **commercial product** with a genuinely free **Community License** limited to non-commercial usage (personal projects, studies) — full functionality, unlimited time, but the chart carries a product watermark, and support tickets/source code are not available on this tier — [FREE LightningChart JS Community License](https://campaigns.lightningchart.com/lightningchart-js-free-community-license)
- Commercial tiers include Web Developer, Application Developer, and Enterprise licenses (paid); a price list cites e.g. 1 developer/1 year at $790, 1 dev/2 years at $1,290, 5 devs/1 year at $2,990 — [LightningChart JS Price List PDF](https://lightningchart.com/wp-content/uploads/2019/07/LightningChart-JS-Price-List.pdf) (note: this PDF appears dated to 2019 and may not reflect current 2026 pricing — treat as directional only)
- A free non-commercial **Student License** also exists — [LightningChart Student License](https://lightningchart.com/free-license-for-students/)
- Confirms the brief's assumption: there is **no free/open commercial-use tier**; only ancillary theme packages (`lcjs-themes`) are MIT-licensed, not the core charting engine — [lcjs-themes LICENSE](https://github.com/Lightning-Chart/lcjs-themes/blob/main/LICENSE)

**Apache ECharts**
- Licensed under **Apache License 2.0**, a genuine permissive OSS license allowing free use, modification, and commercial redistribution — [Apache ECharts GitHub](https://github.com/apache/echarts)
- ECharts is a **Top-Level Project of the Apache Software Foundation**, originally a Baidu internal project donated to the ASF — [ASF announcement of Apache ECharts as Top-Level Project](https://news.apache.org/foundation/entry/the-apache-software-foundation-announces71)
- GitHub stars reported at roughly **66k–67k** depending on snapshot date — [search result citing 67.4k](https://github.com/apache/echarts); a separate LibHunt-sourced comparison cites 66,176 — [LibHunt G2Plot vs echarts](https://js.libhunt.com/compare-g2plot-vs-echarts). Confirms genuinely open, no commercial gating.

**AntV G2 / G2Plot**
- Both **G2** (12.6k GitHub stars) and **G2Plot** (2.6k GitHub stars) are licensed under **MIT** — fully permissive OSS, no commercial restriction — [antvis/G2Plot](https://github.com/antvis/G2Plot), [antvis/G2](https://github.com/antvis/G2)
- AntV is a visualization technology brand incubated by **Ant Group / Alibaba**, and is maintained by the same organizational team that maintains Ant Design — [Introduction to AntV](https://medium.com/antv/introduction-to-antv-af599f4e7e22); AntV "has been tested by huge data business in Ant Financial Services Group and Alibaba Group" per the project's own materials (self-description, treat as a claim rather than independently audited fact).

**Plotly.js**
- Plotly.js is confirmed **MIT-licensed** free and open source — [Plotly.js GitHub](https://github.com/plotly/plotly.js/), [Is plotly.js free?](https://plotly.com/javascript/is-plotly-free/)
- Plotly's **Dash** framework is also MIT-licensed and free/OSS — [Is plotly for python free?](https://plotly.com/python/is-plotly-free/)
- Plotly's commercial offerings — **Chart Studio** (hosted chart creation/sharing) and a newer **Plotly Studio** (an "agentic data analytics" product) — are separate, paid/hosted products layered on top of the OSS library, not required to use plotly.js itself — [Plotly Chart Studio](https://plotly.com/chart-studio/)

### Inferences
- The brief's licensing framing is accurate across the board. The one nuance worth flagging to the report writer: amCharts' historical "free-with-watermark" linkware reputation (amCharts 3/4) appears to have been tightened or is at least ambiguously represented for amCharts 5 on the current official store page, which shows only paid seat-based tiers with no visible always-free watermarked option. This is worth a caveat rather than a flat "free for nonprofit" claim for amCharts 5 specifically.
- "Source-viewable but not OSS" (Highcharts) and "fully commercial with non-commercial-only free tier" (LightningChart) are functionally similar restrictions, differing mainly in whether source code is distributed/inspectable.

### Gaps
- Could not find an authoritative, unambiguous current (2026) statement from amcharts.com itself confirming whether amCharts 5 still offers *any* always-free-with-watermark commercial-use path, or whether that model was fully retired in favor of paid-only tiers. This should be verified by a human before publishing if precision matters.
- Could not independently verify Highcharts' exact current per-developer price figures from a single canonical source; multiple approximate figures ($176, $185, $349, $366) appeared across different third-party aggregator pages rather than one authoritative price sheet.
- Did not find a precise LightningChart JS 2026 price sheet (only a PDF that appears to date to 2019); current pricing should be confirmed directly on lightningchart.com if needed.

---

## Q2: ECharts — is it genuinely fast/comprehensive but criticized as "over-configured" and historically weak in English documentation?

### Takeaway
Evidence supports the "extremely fast, nearly every chart type" reputation (canvas rendering, huge built-in chart catalog, praised by GitLab and Apache Superset) and clearly confirms the historical Chinese-origin/documentation-language friction; however, direct evidence of widespread "over-configured/verbose JSON" complaints was thinner than the brief hypothesized — what we found instead was more "powerful and comprehensive" than "annoyingly verbose," though an ecosystem tool (`echarts-plus`) exists specifically because "building ECharts series option is annoying," which is indirect supporting evidence.

### Cited Findings
- GitLab's engineering blog explains their decision to adopt ECharts in production, citing that it offered "enough flexibility to create custom charts" while providing prebuilt chart types, and that in benchmarking "ECharts...fared better than the alternatives" on complex user interactions — [GitLab: Why we chose ECharts](https://about.gitlab.com/blog/why-we-chose-echarts/)
- The same GitLab post explicitly notes the documentation/language friction: "the majority of ECharts users are China-based, with documentation written primarily in Chinese," despite growing international adoption — [GitLab: Why we chose ECharts](https://about.gitlab.com/blog/why-we-chose-echarts/)
- GitLab also notes a performance caveat: ECharts performance "does decrease as the data points increase," observed starting around 4,000+ points in their testing, though they judged this unlikely to matter for their real use cases — [GitLab: Why we chose ECharts](https://about.gitlab.com/blog/why-we-chose-echarts/)
- A Hacker News discussion thread on Apache ECharts includes a comment from an Apache Superset developer stating ECharts "solve[s] these 3 problems" that plague competing libraries: ugly default aesthetics, difficult imperative APIs, and limited flexibility — implying ECharts is viewed as comparatively *less* configuration-painful than alternatives, not more — [HN: Apache ECharts discussion](https://news.ycombinator.com/item?id=43624220)
- The same HN thread notes a praise point of "npm update" stability across major version bumps (3.x → 5.x "everything just keeps working smoothly") and that ECharts rarely appears in English-language library comparisons "despite superiority, possibly due to Chinese origins" (a commenter's own speculative framing) — [HN: Apache ECharts discussion](https://news.ycombinator.com/item?id=43624220)
- The HN thread also surfaces a bundle-size criticism: one comment cites a 22.7MB *full* download figure (unclear if that's source/unpacked rather than the shipped minified bundle), while modular/tree-shaken imports reduce this substantially — [HN: Apache ECharts discussion](https://news.ycombinator.com/item?id=43624220)
- An accessibility criticism surfaced directly: the HN thread notes "multiple unresolved GitHub issues highlight keyboard navigation and screen reader support gaps" — [HN: Apache ECharts discussion](https://news.ycombinator.com/item?id=43624220)
- Indirect evidence of configuration-complexity friction: the community-built wrapper library `echarts-plus` exists explicitly because, per its own description, "building ECharts series option is annoying" — [echarts-plus GitHub (search snippet)](https://github.com/yutingzhao1991/echarts-plus)
- Apache Superset (which uses ECharts as its charting engine) has open GitHub issues/discussions specifically about exposing ECharts' native `aria` (accessibility) options, indicating the gap is being actively surfaced by downstream consumers — [Superset Issue #28173: Echarts native support for accessibility](https://github.com/apache/superset/issues/28173), [Superset Discussion #32740](https://github.com/apache/superset/discussions/32740)
- ECharts does have formal ARIA/accessibility support since v4 (WAI-ARIA compliant, auto-generates chart descriptions when `aria.show: true` is set, exposes `aria-label` on chart DOM) — but it is **off by default** and, since ECharts 5, the ARIA component must be manually imported — [Apache ECharts Accessibility / ARIA handbook](https://apache.googlesource.com/echarts-handbook/+/4822ab31a3ba7257062b860e3652d1eefaef2bb8/contents/en/best-practices/aria.md), [Features - Apache ECharts](https://echarts.apache.org/en/feature.html)
- Bundle size: ECharts' gzipped size is reported around **359 KB** (full build) via a Bundlephobia-style search result dated July 2026 — substantially larger gzipped than Highcharts (~100KB) or amCharts 5 (~88KB) in the same comparison, though ECharts supports tree-shaken modular imports to cut this down — [search synthesis, bundlephobia-style data, July 2026](https://gist.github.com/goooseman/3488c04052835038cbcbcfe447e2d259)
- A basic ECharts bar chart requires roughly 7–10 lines of configuration object (`xAxis`, `yAxis`, `series`) — [Apache ECharts Get Started handbook](https://echarts.apache.org/handbook/en/get-started/)
- A third-party ECharts-vs-Highcharts comparison claims ECharts' Canvas renderer loads ~5–8x faster than SVG-based alternatives at 100,000 points (~350ms), but that at 1M points both ECharts and Highcharts take ~6,000ms+ and both "crash" at 10M points — this is from an aggregator/comparison blog, not an independently reproduced benchmark, so treat as **unverified, directional only** — [search synthesis comparison blog]

### Inferences
- The "over-configured" framing in the brief is more accurately characterized by the evidence as "comprehensive and powerful, with a steep-but-not-uniquely-bad options object," while the documentation-language and accessibility-defaults gaps are the better-supported, concrete criticisms.
- ECharts' Apache Software Foundation governance (Top-Level Project status) is a meaningful maintenance/credibility signal distinct from a single-vendor open-source project — reduces single-company abandonment risk relative to e.g. amCharts or LightningChart.

### Gaps
- Could not find a direct, quotable Reddit/StackOverflow thread using the specific phrase "over-configured" or explicitly complaining about ECharts' JSON option verbosity as a primary pain point; the strongest adjacent evidence is the `echarts-plus` wrapper's stated motivation and general "steep learning curve for the full options API" sentiment implied across sources, not an explicit damning quote. This should be flagged as a weaker-than-requested evidentiary link.
- Did not find current (2026) precise GitHub issue-backlog counts (open issue count, median time-to-close) for apache/echarts to characterize maintenance responsiveness quantitatively.

---

## Q3: Highcharts — is it the "gold standard" for polish/reliability/support, and what's the real cost/licensing friction?

### Takeaway
Highcharts is strongly corroborated as polished, reliable, and especially strong on accessibility and official framework integrations, backed by a stable 50+ person Norwegian company (Highsoft AS); the licensing/cost friction is real and specifically about *commercial* use requiring per-developer annual fees plus separate SaaS/OEM license types, though multiple sources frame it as "inexpensive relative to enterprise software budgets, expensive relative to free alternatives."

### Cited Findings
- Highsoft AS (maker of Highcharts) is based in Norway (Oslo, Bergen, HQ in Vik i Sogn), founded by Torstein Hønsi in 2010, with more than 50 full-time employees (cited elsewhere as a "56 person team" in 2024) — [Highcharts People](https://www.highcharts.com/people/), [Business Norway: Highsoft AS](https://businessnorway.com/company/highsoft-as), [Getlatka: Highcharts $6.5M revenue, 56-person team](https://getlatka.com/companies/highcharts)
- A StackShare community-vote aggregation shows developers citing Highcharts for: "low learning curve and powerful" (34 votes), multiple chart types (17 votes), responsive charts (13 votes), "handles everything you throw at it" (9 votes), and "extremely easy-to-parse documentation" (8 votes) — [StackShare: Highcharts comparisons](https://stackshare.io/stackups/highcharts-vs-one-charts)
- A Hacker News discussion captured in search results shows debate specifically framing cost: Highcharts is "extremely inexpensive compared to other costs in commercial products" but "expensive compared to free alternatives" — [HN thread referenced in search, item 8262829](https://news.ycombinator.com/item?id=8262829)
- Every Highcharts commercial license includes the **Accessibility module** by default — screen reader point-by-point data navigation, keyboard navigation, low-vision features, voice input, and sonification of chart data — [Highcharts Accessibility Demos](https://www.highcharts.com/accessibility/), [Highcharts Accessibility module docs](https://www.highcharts.com/docs/accessibility/accessibility-module)
- Highcharts targets **WCAG 2.2** as its accessibility guideline and states it involves users with disabilities directly in testing/feature development; its accessibility conformance is positioned to help satisfy US Section 508 and the EU Web Accessibility Directive — [Highsoft Accessibility Conformance Report](https://www.highcharts.com/blog/article/highsoft-accessibility-conformance-report/), [Highcharts Accessibility compliance](https://www.highcharts.com/docs/accessibility/compliance)
- A third-party comparison explicitly states "Highcharts has the strongest accessibility module in the JavaScript charting space... making it suitable for regulated-industry public-facing applications with accessibility requirements that ECharts doesn't meet" — [search synthesis, echarts-vs-highcharts comparison blog]
- A minimal Highcharts bar chart can be instantiated with roughly 4–5 lines (`$('#container').highcharts({ series: [{data: [...]}] })`), slightly more concise at the bare minimum than ECharts' explicit axis-based setup — [Highcharts tutorial examples](https://github.com/ejb/highcharts-tutorial/blob/master/tutorial.md), [Highcharts: Your first chart](https://www.highcharts.com/docs/getting-started/your-first-chart)
- Highcharts' gzipped core bundle size is reported around **100 KB**, notably smaller than ECharts' ~359 KB in the same comparison snapshot — consistent with Highcharts' SVG/modular architecture — [search synthesis, bundlephobia-style data]
- GitHub stars for the core `highcharts/highcharts` repo: **12.5k** (lower than ECharts' ~67k, expected since the source is not freely OSS and the repo is more of a reference/dev mirror than the primary open community hub) — [star-history.com: highcharts/highcharts](https://www.star-history.com/highcharts/highcharts/)
- Highcharts ships official framework wrapper repos maintained by the company itself: React, Angular, Android, iOS — a maintenance/polish signal beyond the core library — [highcharts-react](https://github.com/highcharts/highcharts-react), [highcharts-angular](https://github.com/highcharts/highcharts-angular)

### Inferences
- The "gold standard" reputation is best evidenced concretely through its accessibility module (genuinely differentiated vs. the other five libraries) and its first-party official framework integrations/support organization, rather than through raw performance superiority — other libraries (ECharts, LightningChart) claim comparable or better raw rendering speed.
- The licensing friction is less about price magnitude (it's framed by commenters as cheap relative to enterprise software) and more about *model friction*: needing to classify your use case correctly across Internal/SaaS/OEM license types, and the ambiguity around what counts as "non-commercial."

### Gaps
- Could not find a single authoritative current official Highcharts price sheet listing exact 2026 figures for Developer/SaaS/OEM tiers; figures cited ($176, $185, $349, $366/dev/year) came from third-party aggregators, not highcharts.com/shop.highcharts.com directly, and should be treated as approximate.
- Could not find a specific, quotable 2025/2026 Reddit or HN thread with developers explicitly complaining about licensing *friction* (e.g., confusion about SaaS vs. Internal classification) — the cost complaints found were general ("expensive vs. free alternatives") rather than specific anecdotes of license-classification pain.

---

## Q4: What do developers say about G2Plot/AntV G2's learning curve and English documentation quality?

### Takeaway
G2Plot's own stated design goal is to be *more* beginner-friendly than raw G2 (grammar-of-graphics) by offering a "configure, don't compose" API, and English documentation does exist and is reasonably complete — but G2Plot has markedly smaller community adoption/mindshare than ECharts, and some aggregator metrics show its community activity *declining* rather than growing, which is itself an indirect signal about documentation/support discoverability for English-speaking developers.

### Cited Findings
- G2Plot explicitly positions itself for beginners: "for beginners, configs (or options) are more friendly than grammars — you simply choose a chart type (like Pie, Bar, Line, or Rose) and set the configs," and states that to generate a chart "all you need is to declare a chart type and specify data and configurations" — [G2Plot Getting Started](http://g2plot-v1.antv.vision/en/docs/manual/getting-started/)
- G2Plot documentation is available in English, including getting-started guides and API references — [G2Plot English docs](https://g2plot.antv.vision/en/)
- Underlying G2 (the grammar-of-graphics engine G2Plot is built on) is described by AntV itself as "the concise and progressive visualization grammar," implying a steeper learning curve at the G2 layer vs. the G2Plot convenience layer — [AntV G2](https://g2.antv.antgroup.com/en/)
- A LibHunt open-source metrics comparison shows **G2Plot trailing ECharts substantially** in community engagement: G2Plot's "popularity score" is 5.5 with *declining* activity (3.7), versus ECharts' 9.9 popularity with *growing* activity (9.3); G2Plot has 2,645 GitHub stars vs. ECharts' 66,176; and ECharts shows 22 "mentions" across analyzed sources vs. G2Plot's 1 — [LibHunt: G2Plot vs echarts](https://js.libhunt.com/compare-g2plot-vs-echarts)
- AntV (the umbrella brand covering G2/G2Plot/F2/AVA) is maintained by the same organizational team as Ant Design and has Ant Group/Alibaba-scale internal usage as its validation story, per the project's own "Introduction to AntV" post — [Introduction to AntV](https://medium.com/antv/introduction-to-antv-af599f4e7e22)

### Inferences
- The declining-activity / low-mentions metrics are consistent with a documentation/mindshare gap for English-speaking developers: G2Plot is not undocumented, but it has far less community-generated English content (tutorials, SO answers, blog comparisons) surrounding it than ECharts, which indirectly raises the effective learning curve (less to search for when stuck) even if the official docs themselves are adequate.
- No direct evidence was found of complaints specifically about *translation quality* of G2Plot English docs (unlike the more clearly documented Chinese-origin friction found for ECharts) — the gap here is more about volume/ecosystem size than language quality per se.

### Gaps
- Could not find direct Reddit/Stack Overflow quotes from developers specifically describing the G2Plot/G2 learning curve or documentation experience firsthand; evidence is limited to official project self-description and third-party aggregator popularity metrics, not qualitative user testimony. This is a genuine gap — flagging explicitly per instructions rather than fabricating a quote.
- Could not determine G2Plot's or G2's current (2026) bundle size (gzipped) from search results.

---

## Q5: What's Plotly.js's reputation for scientific/statistical visualization, and how serious are its bundle-size complaints?

### Takeaway
Plotly.js has a strong, well-evidenced reputation for scientific/statistical chart depth (3D, contour, violin, parallel coordinates, choropleth maps) and for consistency with its Python/R siblings, but the bundle-size complaint is extremely well-documented and severe: real production reports cite multi-megabyte bundles (3–10MB+) causing concrete problems (memory issues, slow loads), not just a vague "it's big" sentiment.

### Cited Findings
- Plotly.js ships "over 40 chart types, including 3D charts, statistical graphs, and SVG maps," explicitly covering the scientific/statistical niche that simpler charting libraries don't (3D scatter, surface, contour, violin, parallel coordinates) — [freeCodeCamp: Introduction to plotly.js](https://www.freecodecamp.org/news/an-introduction-to-plotly-js-an-open-source-graphing-library-c036a1876e2e/)
- Plotly.js's cross-language consistency with Plotly.py is cited as a genuine advantage for teams sharing chart definitions between Jupyter notebooks and web applications — [search synthesis / scichart.com Plotly.js alternatives post](https://www.scichart.com/blog/alternatives-to-plotly-js/)
- The project has a large, active contributor base: **258 total contributors** on GitHub, with named maintainers (Alex C. Johnson, Emily Kellison-Linn, Cameron DeCoster) who are Plotly employees, plus active community contributors (Mojtaba Samimi, My-Tien Nguyen, Birk Skyum) — [plotly.js CONTRIBUTING.md / GitHub search snapshot](https://github.com/plotly/plotly.js/blob/master/CONTRIBUTING.md)
- As of the search snapshot, plotly.js has **726 open issues and 77 open pull requests** — a sizable backlog indicative of both high usage and nontrivial maintenance burden — [GitHub: plotly/plotly.js](https://github.com/plotly/plotly.js/)
- Bundle-size complaints are extensive and specific:
  - The full plotly.js bundle is reported at **approximately 3.6MB minified**; in React apps via `react-plotly.js`, unoptimized production builds have been reported to **exceed 10MB** — [search synthesis of Plotly community forum threads]
  - A Plotly community forum user reported plotly.js taking up **10.33MB** in their React build, causing heap memory issues — [Plotly Community: "Plotly js size is huge (>3MB) in production build"](https://community.plotly.com/t/plotly-js-size-is-huge-3mb-in-production-build/45407)
  - Another developer reported the minified plotly file alone at **2.2MB**, calling it "huge" — [Plotly Community: "How can i reduce bundle size of plotly.js in react app?"](https://community.plotly.com/t/how-can-i-reduce-bundle-size-of-plotly-js-in-react-app/89910)
  - A long-open GitHub issue tracks bundle-size optimization directly: [plotly/plotly.js Issue #1802: Bundle size optimisation](https://github.com/plotly/plotly.js/issues/1802)
  - Downstream wrapper maintainers face the same complaint: a `vue-plotly` GitHub issue is titled "dist/ builds are huge because they bundle Plotly" — [David-Desmaisons/vue-plotly Issue #26](https://github.com/David-Desmaisons/vue-plotly/issues/26)
- Partial/custom bundles are the documented mitigation: selecting only the needed trace types can bring the bundle down to **roughly 1MB**, but this is not the default experience and requires explicit build configuration — [search synthesis of Plotly docs/community discussion]
- A third-party scichart.com comparison states plainly: "For static or slowly-updating scientific charts at moderate data volumes (under 50,000 points), Plotly.js works well... If you're not hitting the context limit or bundle size issues, and your data volumes are modest, Plotly is a reasonable choice" — implying real limits at higher data volumes or in bundle-constrained environments — [SciChart: Alternatives to Plotly.js](https://www.scichart.com/blog/alternatives-to-plotly-js/) (note: SciChart is itself a competing commercial charting vendor, so treat its framing as somewhat self-interested, similar to the LightningChart caveat above)
- The HN ECharts discussion (cited above) independently corroborates a documentation-quality criticism of Plotly from the *other side*: commenters there criticized Plotly's "undocumented features and inconsistent documentation across multiple APIs" when comparing it unfavorably to ECharts — [HN: Apache ECharts discussion](https://news.ycombinator.com/item?id=43624220)

### Inferences
- The bundle-size problem is Plotly.js's most concrete, consistently-reproduced weakness across independent sources (official GitHub issues, community forum, downstream wrapper repos) — stronger and more specific evidence than was found for any single complaint about the other five libraries.
- Plotly.js's chart-type depth for scientific/statistical use cases is genuinely differentiated and well-corroborated, making it a plausible best-fit specifically for data-science/Jupyter-adjacent audiences despite the size cost — consistent with its origins and primary audience (scientific Python/R users via Plotly.py/Plotly.R).

### Gaps
- Could not find a precise, current (2026) tree-shaken/partial-bundle minimum size figure from an authoritative source (only the approximate "~1MB" figure from a synthesized community discussion, not an official benchmark page).

---

## Per-Library Structured Summary

### Apache ECharts
- **Primary use case / audience**: General-purpose enterprise dashboards and BI tools needing broad chart-type coverage and strong canvas performance on large datasets; widely adopted inside BI platforms (e.g., Apache Superset) and by engineering orgs like GitLab — [GitLab blog](https://about.gitlab.com/blog/why-we-chose-echarts/)
- **Architecture**: Canvas rendering by default (also supports SVG renderer); not WebGL-first but has a GL extension (`echarts-gl`) for 3D/WebGL.
- **Bundle size**: ~359KB gzipped (full build); modular/tree-shaken imports significantly smaller — [bundlephobia-style search synthesis](https://gist.github.com/goooseman/3488c04052835038cbcbcfe447e2d259)
- **Performance**: Canvas rendering is fast at moderate-to-large scale (GitLab found it outperformed alternatives in complex interactions); GitLab observed degradation starting ~4,000+ points; a third-party benchmark claims ~350ms at 100K points but ~6s+ at 1M points — [GitLab blog](https://about.gitlab.com/blog/why-we-chose-echarts/)
- **API ergonomics**: Declarative single JSON "option" object; basic bar chart ~7-10 lines — [ECharts handbook](https://echarts.apache.org/handbook/en/get-started/); praised on HN for solving "ugly defaults / difficult imperative APIs / limited flexibility" relative to competitors.
- **Chart-type coverage**: Very broad — includes sankey, treemap, graph/network, calendar, candlestick, geo/maps, gauges — confirmed via multiple sources including GitLab and comparison blogs.
- **Accessibility**: WAI-ARIA compliant since v4, auto-generated descriptions, but off by default and requires manual component import since v5; downstream users (Superset) still filing feature requests for more complete exposure — [ECharts accessibility handbook](https://apache.googlesource.com/echarts-handbook/+/4822ab31a3ba7257062b860e3652d1eefaef2bb8/contents/en/best-practices/aria.md)
- **Maintenance/backing**: Apache Software Foundation Top-Level Project (originally Baidu); ~66-67k GitHub stars — [ASF announcement](https://news.apache.org/foundation/entry/the-apache-software-foundation-announces71)
- **License**: Apache-2.0, genuinely free OSS, confirmed.
- **Praise**: fast/canvas-based; huge chart-type catalog; stable major-version upgrades; good defaults ("pretty by default"); framework-agnostic.
- **Complaints**: historically Chinese-first documentation/community; accessibility off-by-default with some unresolved gaps; larger gzipped bundle than Highcharts/amCharts; some friction building complex series options (per `echarts-plus` wrapper's own stated motivation).

### Highcharts
- **Primary use case / audience**: Enterprise/regulated-industry dashboards, especially where accessibility compliance (Section 508/WCAG) and vendor support matter; common in finance (Highcharts Stock) and government/public-sector contexts.
- **Architecture**: SVG rendering (with canvas/boost module for large datasets).
- **Bundle size**: ~100KB gzipped core — [bundlephobia-style search synthesis]
- **Performance**: Comparable to ECharts at very large scale per one third-party benchmark (~6s+ at 1M points, "crashes" at 10M in that same unverified comparison); has a "boost" module specifically for large-dataset acceleration.
- **API ergonomics**: Minimal bar chart in ~4-5 lines via config object — [Highcharts getting started](https://www.highcharts.com/docs/getting-started/your-first-chart); praised for low learning curve and documentation clarity in StackShare community votes.
- **Chart-type coverage**: Broad via official modules (Highcharts Core + Highcharts Stock + Highcharts Maps + Highcharts Gantt + Highcharts Dashboards), including sankey, treemap, network graph, gauges, geo maps — much of this is modular/add-on rather than all bundled by default.
- **Accessibility**: Industry-leading — dedicated Accessibility module bundled with every license, WCAG 2.2 target, sonification, keyboard nav, screen-reader point navigation — [Highcharts accessibility](https://www.highcharts.com/accessibility/)
- **Maintenance/backing**: Highsoft AS, Norway, 50+ employees, founded 2010 by Torstein Hønsi — [Highcharts People](https://www.highcharts.com/people/); ~12.5k GitHub stars (lower than ECharts, expected given source-viewable-not-OSS model).
- **License**: Source-viewable, commercial license required for commercial/government/internal business use; free for non-commercial, education, registered nonprofits — confirmed via official EULA v1.0 (dated 20 Jan 2026).
- **Praise**: "gold standard" polish; best-in-class accessibility; official first-party React/Angular/iOS/Android wrappers; strong documentation; low learning curve for common cases.
- **Complaints**: cost/licensing friction for commercial use (needing Internal vs. SaaS vs. OEM classification); "expensive vs. free alternatives" sentiment on HN even while framed as cheap relative to overall software budgets.

### amCharts
- **Primary use case / audience**: Marketing dashboards, business reporting tools, map-heavy visualizations (amCharts has strong built-in geo/map support); popular with agencies and SMB SaaS products.
- **Architecture**: SVG-based rendering (amCharts 4/5).
- **Bundle size**: ~88KB gzipped — [bundlephobia-style search synthesis]
- **Chart-type coverage**: Broad including maps, gauges, hierarchical/treemap, and stock charts as a separate paid module.
- **Maintenance/backing**: amCharts (company); amcharts5 repo has 444 stars, amcharts4 has 1.2k, amcharts3 393 — [GitHub amcharts org](https://github.com/amcharts) — notably smaller open community footprint than ECharts/Highcharts, consistent with its commercial/closed-development model (GitHub repos appear to be distribution mirrors more than open collaborative codebases).
- **License**: Commercial, paid tiers from Basic ($80-180/seat) through OEM ($1,200-2,700/seat); historical "free with watermark" linkware reputation for older versions is not clearly confirmed as still applicable to amCharts 5 on the current official pricing page — flagged as a conflict/gap above.
- **Praise**: (from general comparison sources) strong default aesthetics, especially for maps; reasonable learning curve.
- **Complaints**: free-tier watermark requirement ("unacceptable for commercial products without a paid license" per search synthesis); pricing structure described as confusing with a steep jump from Basic to SaaS tiers — [search synthesis, no single primary-source quote found]; smaller community/ecosystem than ECharts or Highcharts.

### AntV G2 / G2Plot
- **Primary use case / audience**: Developers wanting a grammar-of-graphics approach (G2) or a simpler configuration-based layer on top of it (G2Plot); popular within the Ant Design / Chinese tech ecosystem.
- **Architecture**: Canvas-based (via G2's own rendering engine, `@antv/g`).
- **API ergonomics**: G2Plot explicitly designed to be more beginner-friendly than raw G2 — "configure, don't compose."
- **Chart-type coverage**: Standard statistical charts well-covered (bar, line, pie, scatter) plus some more advanced grammar-of-graphics-driven types; G2Plot/G2 ecosystem also includes `F2` (mobile) and `AVA` (auto chart recommendation).
- **Maintenance/backing**: Ant Group/Alibaba via the Ant Design team; G2 has 12.6k GitHub stars, G2Plot has 2.6k.
- **License**: MIT — genuinely free OSS, confirmed.
- **Praise**: beginner-friendly configuration layer (G2Plot) over a powerful underlying grammar (G2); backed by large-scale internal usage at Ant/Alibaba.
- **Complaints**: markedly smaller English-language community/mindshare than ECharts (declining popularity-activity score in LibHunt metrics: 5.5 popularity / 3.7 activity trend vs. ECharts' 9.9/9.3); far fewer "mentions" in aggregator data (1 vs. 22 for ECharts) — a real but indirect signal of documentation/discoverability friction rather than documented quality complaints per se.

### LightningChart JS
- **Primary use case / audience**: Scientific, industrial, medical, and financial real-time/high-volume data visualization (e.g., oscilloscope-style streaming, point clouds, large XY series) — explicitly positioned against ECharts/Highcharts/Chart.js for "when canvas hits its ceiling."
- **Architecture**: WebGL-based, GPU-accelerated; data lives in GPU vertex buffers for streaming rather than JS heap arrays — [LightningChart JS](https://lightningchart.com/js-charts/)
- **Performance**: Vendor-claimed figures (self-reported, not independently verified): up to 1.5 billion data points for interactive line charts; 10 million points rendered in ~290ms cold start; 24 million data points/frame at 60 FPS in a 400-channel/1kHz streaming scenario; real-time streaming via scrolling buffer maintains fixed memory footprint indefinitely — [LightningChart marketing blog, self-sourced claims]. **These are vendor marketing claims from LightningChart's own blog and should be treated with appropriate skepticism** — no independent third-party benchmark was found to corroborate them.
- **Chart-type coverage**: 100+ chart types claimed, including 3D, XY, heatmaps, polar, radar, pie/donut, funnel, bar variants, gauge (radial & linear), pyramid, and treemap; **no evidence found of native sankey or network/graph chart support** — a real coverage gap versus ECharts/Highcharts/amCharts for those specific exotic types.
- **License**: Fully commercial; free tier is **Community License, non-commercial only** (watermarked, no support/source access); separate free Student License; paid Web Developer/Application Developer/Enterprise tiers — confirmed, matches the brief's hypothesis exactly.
- **Praise**: (per vendor and general WebGL-charting discourse) genuinely differentiated real-time streaming/large-dataset performance via GPU rendering architecture.
- **Complaints**: no sankey/network graph support found; fully commercial with only a non-commercial free tier (no path to free commercial use at any data volume); most available "comparison" content is vendor-authored (LightningChart's own blog), making independent-complaint sourcing difficult — a genuine research gap, see below.

### Plotly.js
- **Primary use case / audience**: Scientific/statistical visualization, especially for teams spanning Python/R (Jupyter, Dash) and JavaScript/web, given cross-language API consistency with Plotly.py/Plotly.R.
- **Architecture**: SVG + D3-based for 2D traces, WebGL for selected trace types (e.g., scattergl, 3D).
- **Bundle size**: ~3.6MB minified full bundle; real-world React integrations reported at 10MB+ unoptimized; partial/custom bundles can shrink this to ~1MB but require manual build configuration — extensively documented via official GitHub issues and the Plotly community forum (see Q5 above).
- **Chart-type coverage**: 40+ trace types including 3D scatter/surface, contour, violin, parallel coordinates, choropleth/geo maps, sankey, treemap, and an "indicator" trace that supports gauge-style displays — strong coverage of scientific/statistical exotic types.
- **Maintenance/backing**: Plotly (the company); maintainers are Plotly employees (Alex C. Johnson, Emily Kellison-Linn, Cameron DeCoster) plus active community contributors; 258 total GitHub contributors; 726 open issues / 77 open PRs at search snapshot — sizable but not clearly worsening backlog.
- **License**: MIT, genuinely free OSS, confirmed; Dash is also MIT/OSS; Chart Studio and the newer "Plotly Studio" are separate paid/hosted commercial products, not required for plotly.js use.
- **Praise**: deep scientific/statistical chart-type coverage; strong cross-language (Python/R/JS) consistency; large, active open-source contributor base.
- **Complaints**: bundle size is the single most consistently and concretely documented complaint of any library in this research set — specific multi-megabyte figures, named GitHub issues, community forum threads, and downstream wrapper-repo issues all converge on this; secondary complaint (from an ECharts-partisan HN comment) about "undocumented features and inconsistent documentation across multiple APIs."

---

## Overall Gaps Not Covered Elsewhere
- No independent (non-vendor) benchmark was found comparing all six libraries head-to-head on identical hardware/dataset sizes; all large-dataset performance figures are either vendor-self-reported (LightningChart) or drawn from aggregator/comparison blogs rather than reproducible first-party benchmarks — the report-writer should caveat any quantitative performance comparisons across libraries accordingly.
- Mobile/touch support specifics (pinch-zoom, touch gestures) were not directly researched for any of the six libraries in this pass — not covered due to tool-call budget; flagging as an explicit gap per the brief's requested dimension list.
- 3D/geo-specific chart-type depth (beyond basic confirmation of presence/absence) was not deeply researched per library (e.g., exact projection support in geo/maps, WebGL 3D feature parity) — only presence/absence was confirmed, not depth of implementation.
