# Browser baseline

mayaCharts uses [Baseline](https://web.dev/baseline) Widely Available platform features directly, and ships a small fallback for anything only Newly Available. Statuses checked 2026-10-03 (Widely Available = 30 months after Newly Available); re-verify at [webstatus.dev](https://webstatus.dev) before removing a fallback.

| Feature                                          | Used for                 | Baseline status                  | mayaCharts fallback                      | Reference                                                                                    |
| ------------------------------------------------ | ------------------------ | -------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| CSS anchor positioning                           | Tooltip placement        | Newly Jan 2026 (Firefox 147)     | JS clamp to `visualViewport`             | [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_anchor_positioning)               |
| Popover API                                      | Tooltip in the top layer | Newly Apr 2024 → Widely Oct 2026 | None                                     | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API)                          |
| `light-dark()`                                   | Dark mode                | Newly May 2024 → Widely Nov 2026 | `@supports not` + `prefers-color-scheme` | [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark)               |
| `color-mix()`                                    | Derived fills, hover     | Widely (since Nov 2025)          | None                                     | [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix)                |
| `oklch()`                                        | Palette                  | Widely (since Nov 2025)          | None                                     | [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch)                    |
| Container size queries                           | Responsive legend, fonts | Widely (since Aug 2025)          | None                                     | [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries)    |
| Declarative Shadow DOM                           | Server rendering         | Newly Feb 2024 → Widely Aug 2026 | None (no-JS output still renders)        | [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/template#shadowrootmode)     |
| Web Animations API                               | Update animation         | Widely                           | None (no animation = instant update)     | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API)                   |
| Custom elements                                  | `<maya-chart>`           | Widely                           | None                                     | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements) |
| Constructable stylesheets (`adoptedStyleSheets`) | Shadow root styling      | Widely (since Sep 2025)          | None                                     | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/adoptedStyleSheets)        |
| ResizeObserver                                   | Resize                   | Widely                           | None                                     | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)                       |
| Pointer events                                   | Mouse and touch          | Widely                           | None                                     | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)                       |

## Notes

1. SVG child elements cannot be anchor-positioning anchors (the CSSWG deferred this to Level 2). The tooltip anchors to an invisible HTML probe element that is moved over the hovered mark; the browser still does the flipping and viewport fitting.
2. Anchor names are tree-scoped, so the probe and the tooltip both live inside the chart's shadow root. The tooltip is never portaled to `document.body`.
3. Delete the `light-dark()` fallback once it is Widely Available (after Nov 2026). Delete the anchor-positioning fallback once that is Widely Available (~Jul 2028).
