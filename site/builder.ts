// Chart builder: pick a type, bring data, map fields, copy code for a platform. The state is the
// spec itself; every change rebuilds the controls that depend on it, sets the preview's spec and
// rewrites the code. All text reaches the page through textContent or form values.
import "mayacharts/element";
import "mayacharts/hierarchy";
import "mayacharts/flow";
import "mayacharts/geo";
import "mayacharts/radial";
import type { ChartSpec, ChartType, MayaErrorDetail } from "../src/index.ts";
import {
  GROUPS,
  LIMITS,
  ROLES,
  ROLE_LABEL,
  TABS,
  TYPES,
  applies,
  bytes,
  controls,
  cutNote,
  fromControl,
  guess,
  around,
  aroundOf,
  columnsOf,
  explain,
  formatFields,
  formatOf,
  FORMAT_EXAMPLE,
  FORMAT_HELP,
  FORMATS,
  helpFor,
  TYPE_HELP,
  withFormat,
  label,
  parse,
  prober,
  reroll,
  type Block,
  roles,
  sample,
  snippets,
  type Col,
  type Role,
  type Tab,
} from "./builder-kit.ts";
import { theme } from "./theme.ts";

theme();

type Chart = HTMLElement & { spec: ChartSpec };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...kids);
  return el;
}

// ---------------------------------------------------------------------------------------------
// Help: an "i" button after each label shows what the control does in one floating tooltip, on
// hover, focus or tap, placed under it and kept on screen. Escape closes it; pointing at the
// tooltip keeps it open (WCAG 1.4.13). The control also gets the text as its description.

const tipBox = $("tip");
let tipFor: HTMLElement | null = null;
let tipWait = 0;
let tipCount = 0;
function info(about: string, text: string, control: Element | null): HTMLButtonElement {
  const sr = make("span", { className: "sr-only", id: `tip-${++tipCount}` }, text);
  const b = make("button", { type: "button", className: "info" }, make("span", {}, "i"), sr);
  b.setAttribute("aria-label", `About ${about}`);
  b.setAttribute("aria-describedby", sr.id);
  b.dataset["tip"] = text;
  if (control)
    control.setAttribute(
      "aria-describedby",
      [control.getAttribute("aria-describedby"), sr.id].filter(Boolean).join(" "),
    );
  return b;
}
/** A label and its "i" button on one line. */
const labelled = (el: HTMLElement, about: string, text: string, control: Element | null) =>
  text ? make("span", { className: "label-row" }, el, info(about, text, control)) : el;
function showTip(host: HTMLElement): void {
  clearTimeout(tipWait);
  if (tipFor === host && !tipBox.hidden) return;
  tipFor = host;
  tipBox.textContent = host.dataset["tip"] ?? "";
  tipBox.hidden = false;
  const r = host.getBoundingClientRect();
  const w = tipBox.offsetWidth;
  const h = tipBox.offsetHeight;
  const below = r.bottom + 6 + h <= innerHeight;
  tipBox.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  tipBox.style.top = `${below ? r.bottom + 6 : r.top - h - 6}px`;
}
function hideTip(now = false): void {
  clearTimeout(tipWait);
  const go = () => {
    tipBox.hidden = true;
    tipFor = null;
  };
  if (now) go();
  else tipWait = window.setTimeout(go, 200);
}
// The tooltip takes no clicks (it may sit over the next control), so "pointing at it" is read
// from the pointer position instead.
const overTip = (e: PointerEvent) => {
  const r = tipBox.getBoundingClientRect();
  return (
    !tipBox.hidden &&
    e.clientX >= r.left &&
    e.clientX <= r.right &&
    e.clientY >= r.top &&
    e.clientY <= r.bottom
  );
};
document.addEventListener("pointermove", (e) => {
  const host = (e.target as Element).closest<HTMLElement>(".info");
  if (host && !overTip(e)) showTip(host);
  else if (overTip(e)) clearTimeout(tipWait);
  else if (tipFor) hideTip();
});
document.addEventListener("focusin", (e) => {
  const host = (e.target as Element).closest<HTMLElement>(".info");
  if (host) showTip(host);
  else hideTip(true);
});
// A tap focuses the button in most browsers, but not Safari: show on click too.
document.addEventListener("click", (e) => {
  const host = (e.target as Element).closest<HTMLElement>(".info");
  if (host) showTip(host);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !tipBox.hidden) hideTip(true);
});
// Keep an open tooltip under its control while the page scrolls.
addEventListener(
  "scroll",
  () => {
    if (tipFor && !tipBox.hidden) {
      const host = tipFor;
      tipFor = null;
      showTip(host);
    }
  },
  { passive: true },
);

const chart = $<Chart>("chart");
const paste = $<HTMLTextAreaElement>("paste");
const CONTROLS = controls().filter((c) => c.kind !== "unknown");

let spec: ChartSpec = sample("bar");
type Mine = { cols: Col[]; rows: ChartSpec["data"] } | null;
let mine: Mine = null; // pasted data, when in use
let tab: Tab = "HTML";

/** Keys the user set that are not field roles or data, carried across a type change. */
const options = (s: ChartSpec, t: string) =>
  Object.fromEntries(
    Object.entries(s).filter(
      ([k]) =>
        !(ROLES as readonly string[]).includes(k) &&
        k !== "data" &&
        k !== "type" &&
        k !== "totals" &&
        applies(k, t),
    ),
  );

function setType(t: ChartType): void {
  spec = mine
    ? ({ type: t, ...options(spec, t), ...guess(t, mine.cols), data: mine.rows } as ChartSpec)
    : sample(t);
  update(true);
}

// ---------------------------------------------------------------------------------------------
// Type picker: native radios, so arrow keys move between types.

const picker = $("types");
for (const [name, list] of [
  ...GROUPS,
  ["More", TYPES.filter((t) => !GROUPS.some(([, l]) => l.includes(t)))] as const,
]) {
  const types = list.filter((t) => (TYPES as readonly string[]).includes(t));
  if (!types.length) continue;
  picker.append(
    make("p", { className: "type-group" }, name),
    make(
      "div",
      { className: "type-row" },
      ...types.map((t) => {
        const input = make("input", {
          type: "radio",
          name: "type",
          value: t,
          checked: t === spec.type,
        });
        return make("label", { className: "type" }, input, make("span", {}, label(t)));
      }),
    ),
  );
}
picker.addEventListener("change", (e) =>
  setType((e.target as HTMLInputElement).value as ChartType),
);

// ---------------------------------------------------------------------------------------------
// Data: sample or pasted.

const meter = $("meter");
const pasteErr = $("paste-err");
const kb = (b: number) => `${Math.ceil(b / 1000).toLocaleString("en-US")} KB`;

function useSample(on: boolean): void {
  $("paste-box").hidden = on;
  if (on) {
    mine = null;
    spec = sample(spec.type);
    update(true);
  } else readPaste();
}
for (const r of document.querySelectorAll<HTMLInputElement>("input[name=source]"))
  r.addEventListener("change", () => useSample(r.value === "sample"));

let wait = 0;
paste.addEventListener("input", () => {
  clearTimeout(wait);
  wait = window.setTimeout(readPaste, 250);
});

function readPaste(): void {
  const text = paste.value;
  const size = bytes(text);
  meter.textContent = `${kb(size)} of ${kb(LIMITS.bytes)}`;
  if (!text.trim()) return showPasteError("");
  const p = parse(text); // checks the size limit before it reads anything

  if ("error" in p) return showPasteError(p.error);
  showPasteError("");
  meter.textContent = `${p.rows.length.toLocaleString("en-US")} rows, ${p.cols.length} columns, ${kb(size)} of ${kb(LIMITS.bytes)}`;
  // Options the user set on their own data carry over; a sample's title and format do not.
  const kept = mine ? options(spec, spec.type) : {};
  mine = { cols: p.cols, rows: p.rows };
  spec = {
    type: spec.type,
    ...kept,
    ...guess(spec.type, p.cols),
    data: p.rows,
  } as ChartSpec;
  update(true);
}

/** An empty message clears the error. The last good chart stays either way. */
function showPasteError(msg: string): void {
  pasteErr.textContent = msg;
  pasteErr.hidden = !msg;
  paste.setAttribute("aria-invalid", String(!!msg));
}

// ---------------------------------------------------------------------------------------------
// Fields and options, rebuilt on every change (a few dozen nodes).

const fieldsBox = $("fields");
const optionsBox = $("options");

/** Columns of the current data, from the paste or read off the sample rows. */
function columns(): Col[] {
  return mine ? mine.cols : columnsOf(spec.data);
}

function set(key: string, value: unknown): void {
  const next = { ...spec } as Record<string, unknown>;
  if (value === undefined || (Array.isArray(value) && !value.length)) delete next[key];
  else next[key] = value;
  spec = next as unknown as ChartSpec;
  update(false);
}

function select(
  id: string,
  values: string[],
  current: unknown,
  none: string | null,
): HTMLSelectElement {
  const el = make("select", { id });
  if (none !== null) el.append(make("option", { value: "" }, none));
  for (const v of values) el.append(make("option", { value: v, selected: v === current }, v));
  if (current !== undefined && !values.includes(String(current)))
    el.append(make("option", { value: String(current), selected: true }, String(current)));
  return el;
}

function fieldControls(): void {
  const cols = columns();
  const names = cols.map((c) => c.name);
  const nums = cols.filter((c) => c.kind === "number").map((c) => c.name);
  const out: HTMLElement[] = [];
  for (const k of roles(spec.type)) out.push(role(k, names, nums.length ? nums : names));
  $("cols").replaceChildren(
    ...cols.map((c) =>
      make("li", { title: `${c.name}: ${c.kind}` }, c.name, make("span", {}, c.kind)),
    ),
  );
  fieldsBox.replaceChildren(...out);
}

function role(k: Role, names: string[], nums: string[]): HTMLElement {
  const id = `f-${k}`;
  const cur = spec[k];
  const row = make("div", { className: "field" });
  row.dataset["key"] = k;
  if (k === "y") {
    // Several values: a measure toggle, or the columns of a table and the axes of parallel.
    const now = () => [spec.y ?? []].flat() as string[];
    const chosen = now();
    const set_ = make("fieldset", { className: "checks" });
    set_.setAttribute("aria-label", `${ROLE_LABEL.y} (y)`);
    set_.append(make("legend", {}, `${ROLE_LABEL.y} (y)`, info(ROLE_LABEL.y, helpFor(k), set_)));
    for (const n of nums) {
      const box = make("input", { type: "checkbox", value: n, checked: chosen.includes(n) });
      box.addEventListener("change", () => {
        const was = now();
        const next = nums.filter((f) => (f === n ? box.checked : was.includes(f)));
        set("y", next.length === 1 ? next[0] : next);
      });
      set_.append(make("label", {}, box, n));
    }
    row.append(set_);
    return row;
  }
  if (k === "path") {
    const levels = (cur as string[] | undefined) ?? [];
    const set_ = make("fieldset", { className: "levels" });
    set_.setAttribute("aria-label", `${ROLE_LABEL.path} (path)`);
    set_.append(
      make("legend", {}, `${ROLE_LABEL.path} (path)`, info(ROLE_LABEL.path, helpFor(k), set_)),
    );
    for (let i = 0; i < Math.max(3, levels.length); i++) {
      const sel = select(`${id}-${i}`, names, levels[i], i < 2 ? null : "None");
      if (i < 2 && levels[i] === undefined)
        sel.prepend(make("option", { value: "", selected: true }, "Choose"));
      sel.addEventListener("change", () => {
        const next = [...((spec.path as string[] | undefined) ?? [])];
        next[i] = sel.value;
        set("path", next.filter(Boolean));
      });
      set_.append(make("label", { htmlFor: sel.id }, `Level ${i + 1}`), sel);
    }
    row.append(set_);
    return row;
  }
  const required = k === "x" && spec.type !== "kpi";
  const sel = select(
    id,
    k === "size" || k === "y2" ? nums : names,
    cur,
    required && cur !== undefined ? null : "None",
  );
  sel.addEventListener("change", () => set(k, sel.value || undefined));
  row.append(
    labelled(
      make("label", { htmlFor: id }, `${ROLE_LABEL[k]} (${k})`),
      ROLE_LABEL[k],
      helpFor(k),
      sel,
    ),
    sel,
  );
  return row;
}

/**
 * One format per field it applies to, category first: a style for numbers and dates, words
 * before and after for a text category. Rebuilt only when the fields or their kinds change, so a
 * control is never swapped out while someone types or tabs through it.
 */
let formatsFor = "";
function formatControls(force: boolean): void {
  const fields = formatFields(spec, columns());
  const names = fields.map((f) => f.field);
  const sig = JSON.stringify(fields);
  if (sig === formatsFor && !force) return;
  formatsFor = sig;
  const box = $("formats");
  box.hidden = !fields.length;
  const commit = (field: string, v: string) => set("format", withFormat(spec, names, field, v));
  box.replaceChildren(
    make(
      "p",
      { className: "formats-head label-row" },
      "Formats",
      info("Formats", FORMAT_HELP, null),
    ),
    ...fields.map(({ field, kind, role }) => {
      const id = `fmt-${field.replace(/\W+/g, "_")}`;
      const name = make("label", { htmlFor: id }, field, make("span", {}, ROLE_LABEL[role]));
      const row = make("div", { className: "field" }, name);
      row.dataset["key"] = "format";
      if (kind === "text") {
        const [b, a] = aroundOf(formatOf(spec, field));
        const before = make("input", { id, type: "text", value: b, placeholder: "Before" });
        const after = make("input", {
          id: `${id}-after`,
          type: "text",
          value: a,
          placeholder: "After",
        });
        before.setAttribute("aria-label", `Text before ${field}`);
        after.setAttribute("aria-label", `Text after ${field}`);
        for (const el of [before, after])
          el.addEventListener("change", () => commit(field, around(before.value, after.value)));
        row.append(make("span", { className: "around" }, before, make("span", {}, "value"), after));
        return row;
      }
      const sel = make("select", { id });
      sel.append(make("option", { value: "" }, "Default"));
      for (const p of FORMATS[kind])
        sel.append(make("option", { value: p }, `${p} (${FORMAT_EXAMPLE[p] ?? p})`));
      sel.value = formatOf(spec, field);
      sel.addEventListener("change", () => commit(field, sel.value));
      row.append(sel);
      return row;
    }),
  );
}

/** Re-check every option against the current spec: disable, or hide, what would break it. */
let refreshers: ((probe: ReturnType<typeof prober>) => void)[] = [];
const refresh = () => {
  const probe = prober(spec);
  for (const r of refreshers) r(probe);
};
const reason = (el: HTMLElement, b: Block | null) => {
  el.textContent = b?.why ?? "";
  el.hidden = !b;
};

function optionControls(): void {
  refreshers = [];
  const text: HTMLElement[] = [];
  const pick: HTMLElement[] = [];
  const toggles: HTMLElement[] = [];
  for (const c of CONTROLS) {
    if (!applies(c.key, spec.type)) continue;
    const id = `o-${c.key}`;
    const cur = (spec as unknown as Record<string, unknown>)[c.key];
    const row = make("div", { className: "field" });
    row.dataset["key"] = c.key;
    const why = make("small", { className: "why", id: `${id}-why`, hidden: true });
    if (c.kind === "bool") {
      const box = make("input", {
        type: "checkbox",
        id,
        checked: (cur ?? c.def ?? false) === true,
      });
      box.addEventListener("change", () =>
        set(c.key, box.checked === (c.def ?? false) ? undefined : box.checked),
      );
      box.setAttribute("aria-describedby", why.id);
      row.append(
        box,
        labelled(make("label", { htmlFor: id }, label(c.key)), label(c.key), helpFor(c.key), box),
        why,
      );
      // Turning an option off is always allowed; turning it on is checked first.
      refreshers.push((probe) => {
        const b = box.checked ? null : probe(c.key, true);
        row.hidden = !!b?.hide;
        row.classList.toggle("off", !!b);
        box.disabled = !!b;
        reason(why, b);
      });
      toggles.push(row);
      continue;
    }
    const el =
      c.kind === "enum"
        ? select(
            id,
            c.values,
            cur === true ? "true" : cur,
            c.def === undefined ? "Default" : `Default (${String(c.def)})`,
          )
        : make("input", {
            id,
            type: c.kind === "int" ? "number" : "text",
            value: cur === undefined ? "" : String(cur),
            placeholder: c.def === undefined ? "" : String(c.def),
            ...(c.kind === "int" ? { min: "1", step: "1" } : {}),
          });
    el.addEventListener("change", () => {
      const v = fromControl(c, el.value.trim());
      set(c.key, c.kind === "int" && !(Number.isInteger(v) && (v as number) >= 1) ? undefined : v);
    });
    el.setAttribute("aria-describedby", why.id);
    row.append(
      labelled(make("label", { htmlFor: id }, label(c.key)), label(c.key), helpFor(c.key), el),
      el,
      why,
    );
    if (el instanceof HTMLSelectElement)
      refreshers.push((probe) => {
        // Each value the spec cannot take is disabled, with the reason as its tooltip. When none
        // can be chosen, the whole control is, and the reason shows under it.
        const opts = [...el.options].filter((o) => o.value !== "" && !o.selected);
        const blocks = opts.map((o) => probe(c.key, fromControl(c, o.value)));
        opts.forEach((o, i) => {
          o.disabled = !!blocks[i];
          o.title = blocks[i]?.why ?? "";
        });
        const all = el.value === "" && opts.length > 0 && blocks.every(Boolean);
        row.hidden = all && blocks.every((b) => b!.hide);
        el.disabled = all;
        reason(why, all ? blocks[0]! : null);
      });
    (c.kind === "text" ? text : pick).push(row);
  }
  optionsBox.replaceChildren(
    make("div", { className: "grid" }, ...text),
    make("div", { className: "grid" }, ...pick),
    make("div", { className: "toggles" }, ...toggles),
  );
}

// ---------------------------------------------------------------------------------------------
// Accent colour: writes spec.theme so the copied code carries it.

const accent = $<HTMLInputElement>("accent");
accent.addEventListener("input", () => set("theme", { accent: accent.value }));
$("accent-reset").addEventListener("click", () => {
  accent.value = "#3b82f6";
  set("theme", undefined);
});

// ---------------------------------------------------------------------------------------------
// Preview errors: the element validates. The builder replaces its box with the problem in the
// builder's own words, marks the control to change, and offers to undo the change that broke it.

const chartErr = $("chart-err");
let good: { spec: ChartSpec; mine: Mine } | null = null;
chart.addEventListener("maya-render", () => {
  good = { spec, mine };
  chartErr.hidden = true;
  $("code-warn").hidden = true;
  for (const f of document.querySelectorAll(".field.bad")) f.classList.remove("bad");
});
chart.addEventListener("maya-error", (e) => {
  e.preventDefault();
  const d = (e as CustomEvent<MayaErrorDetail>).detail;
  const { headline, hint } = explain(d.message, d.code, d.path);
  const undo = make("button", { type: "button" }, "Undo last change");
  undo.addEventListener("click", () => {
    if (!good) return;
    ({ spec, mine } = good);
    if (!mine) {
      for (const r of document.querySelectorAll<HTMLInputElement>("input[name=source]"))
        r.checked = r.value === "sample";
      $("paste-box").hidden = true;
    }
    update(true);
  });
  chartErr.replaceChildren(
    make("strong", {}, headline),
    ...(hint ? [make("p", {}, hint)] : []),
    make(
      "div",
      { className: "problem-actions" },
      ...(good ? [undo] : []),
      make("a", { href: `./errors.html#${d.code}` }, "More about this error"),
    ),
  );
  chartErr.hidden = false;
  $("code-warn").hidden = false;
  // "y", "path[1]" or "data[3].Sales": mark the control that sets that key or field.
  const [key = "", field] = d.path.split(/[.[\]]+/);
  const at =
    key === "data"
      ? roles(spec.type).find((k) => [spec[k] ?? []].flat().includes(field as never))
      : key;
  for (const f of document.querySelectorAll<HTMLElement>(".field"))
    f.classList.toggle("bad", f.dataset["key"] === at);
});

// ---------------------------------------------------------------------------------------------
// Code tabs.

const tabs = $("tabs");
const panel = $("panel");
const live = $("live");
const tabButtons = TABS.map((t) => {
  const b = make("button", { type: "button", id: `tab-${t}` }, t);
  b.setAttribute("role", "tab");
  b.setAttribute("aria-controls", "panel");
  b.addEventListener("click", () => {
    tab = t;
    code();
  });
  return b;
});
tabs.append(...tabButtons);
tabs.addEventListener("keydown", (e) => {
  const step = { ArrowRight: 1, ArrowLeft: -1, Home: -TABS.length, End: TABS.length }[e.key];
  if (step === undefined) return;
  e.preventDefault();
  const i = Math.min(TABS.length - 1, Math.max(0, TABS.indexOf(tab) + step));
  tab = TABS[i]!;
  code();
  tabButtons[i]!.focus();
});

async function copy(
  text: string,
  name: string,
  btn: HTMLButtonElement,
  pre: HTMLElement,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "Copied";
    live.textContent = `Copied ${name}`;
  } catch {
    // No clipboard access (an insecure context or a denied permission): select it for Ctrl+C.
    getSelection()?.selectAllChildren(pre);
    btn.textContent = "Selected";
    live.textContent = `${name} is selected. Press Control C or Command C to copy.`;
  }
  setTimeout(() => (btn.textContent = "Copy"), 1600);
}

function code(): void {
  const files = snippets(spec)[tab];
  tabButtons.forEach((b, i) => {
    const on = TABS[i] === tab;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  });
  panel.setAttribute("aria-labelledby", `tab-${tab}`);
  panel.replaceChildren(
    ...files.map((f) => {
      const pre = make("pre", { tabIndex: 0 }, make("code", {}, f.code));
      pre.setAttribute("aria-label", f.name);
      const btn = make("button", { type: "button", className: "copy" }, "Copy");
      btn.setAttribute("aria-label", `Copy ${f.name}`);
      btn.addEventListener("click", () => copy(f.code, f.name, btn, pre));
      return make(
        "div",
        { className: "file" },
        make("div", { className: "file-head" }, make("span", {}, f.name), btn),
        pre,
      );
    }),
  );
  const note = cutNote(spec);
  $("cut-note").textContent = note;
  $("cut-note").hidden = !note;
}

// ---------------------------------------------------------------------------------------------
// Re-roll: new sample numbers, same rows, so the update animates. Pasted data is never changed.

const rerollBtn = $<HTMLButtonElement>("reroll");
rerollBtn.addEventListener("click", () => {
  spec = reroll(spec);
  update(false);
});

// ---------------------------------------------------------------------------------------------

$("reset").addEventListener("click", () => {
  mine = null;
  paste.value = "";
  showPasteError("");
  meter.textContent = "";
  for (const r of document.querySelectorAll<HTMLInputElement>("input[name=source]"))
    r.checked = r.value === "sample";
  $("paste-box").hidden = true;
  accent.value = "#3b82f6";
  spec = sample("bar");
  update(true);
});

/**
 * `rebuild` after a type or data change redraws the field and option controls. A value change
 * does not: rebuilding would detach the control the user is moving focus to.
 */
function update(rebuild: boolean): void {
  if (rebuild) {
    for (const r of picker.querySelectorAll<HTMLInputElement>("input"))
      r.checked = r.value === spec.type;
    $("type-help").textContent = TYPE_HELP[spec.type] ?? "";
    fieldControls();
    optionControls();
  }
  // A format keyed by a field no longer in use would be an unknown-field error: drop it.
  if (spec.format && typeof spec.format === "object") {
    const fields = formatFields(spec, columns()).map((f) => f.field);
    const format = withFormat(spec, fields, "", "");
    spec = { ...spec, format } as ChartSpec;
    if (!format) delete (spec as { format?: unknown }).format;
  }
  formatControls(rebuild);
  refresh();
  rerollBtn.hidden = !!mine;
  chart.spec = spec;
  code();
}

update(true);
// For e2e/builder.spec.ts: the spec the preview shows.
(window as unknown as { builderSpec: () => ChartSpec }).builderSpec = () => spec;
