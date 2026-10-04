# Looks rubric

The looks row on the scoreboard is judgment, not measurement. This file is the rubric the judge uses, so
anyone can disagree with a score and point at the line they disagree with.

## What is judged

Each library draws the twelve reference charts in `e2e/compare/ref/` with its own defaults, in a 640 by 360
box, light colour scheme. The judge also sees each chart at 360 px wide and with `prefers-color-scheme: dark`.
The judge sees the screenshots side by side with the library names hidden, scores them, and only then is
told which is which.

## Criteria

Each criterion scores 0, 1 or 2. A chart's score is the sum, out of 14. A library's score is the mean over
the charts it supports. Unsupported charts are listed, not scored.

1. **Data first.** The marks are the strongest thing on the page. Gridlines, borders, backgrounds and
   frames are quiet or absent. 0: chrome competes with the data. 2: nothing could be removed.
2. **Labels read.** Tick labels, category names and values are legible without rotation where a
   different layout would avoid it, never overlap, never clip, and are thinned rather than crammed.
   0: any overlap or clipping. 2: every label reads at a glance.
3. **Numbers are formatted.** Ticks are round numbers, large values are grouped or abbreviated, dates read
   as dates. 0: raw values such as 1700000000000 or 37.29999. 2: a person would have written them.
4. **Colour.** Series are distinguishable, including for the common colour vision deficiencies; marks meet
   3:1 contrast against the background; a sequential scale reads as ordered. 0: two series that look alike
   or a mark under 3:1. 2: all three hold.
5. **Legend and title.** The chart says what it is and which colour is which, without overlapping the
   plot or each other. Direct labels count as a legend. 0: overlap or a missing key for several series.
   2: clear and out of the way.
6. **Small screens.** At 360 px wide the chart still reads: labels thin or move, nothing overflows the box.
   0: unreadable or overflowing. 2: as readable as at 640 px.
7. **Dark mode.** With `prefers-color-scheme: dark` and a dark page, the chart is readable without host
   code. 0: dark text on dark or a white box. 2: it adapts.

## Rules for the judge

- Score defaults only. A library that looks better after configuration is not scored on that.
- Score what is drawn, not what is promised by docs.
- Write one sentence of reason for every 0 and every 2.
- mayaCharts gets no benefit of the doubt. Ties go to the rival.
