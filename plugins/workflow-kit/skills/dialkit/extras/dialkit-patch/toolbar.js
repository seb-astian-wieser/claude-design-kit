// Blick patch: one toolbar for the whole panel (copy, undo, redo, version history, sections menu).
// Inserted into DialKit's bundle just before its Panel component (see dialkit-patch/plugin.js),
// so it can use the bundle's own DialStore, buildCopyInstruction and icons.
import { jsx as jsxDK, jsxs as jsxsDK } from "react/jsx-runtime";
import { useState as useStateDK, useEffect as useEffectDK, useLayoutEffect as useLayoutEffectDK, useRef as useRefDK, useSyncExternalStore as useSESDK } from "react";
import { createPortal as createPortalDK } from "react-dom";

const dkClean = (values) => {
  const out = {};
  for (const [k, v] of Object.entries(values)) if (!k.endsWith(".__mode")) out[k] = v;
  return out;
};
// Deep equality that ignores key order.
function dkEq(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => dkEq(a[k], b[k]));
}

// Undo/redo over every panel's values. A burst of changes (one slider drag) is one step.
var DialHistory = (() => {
  let past = [];
  let future = [];
  let last = {};
  let pending = null;
  let timer = 0;
  let applying = false;
  let paused = false;
  let started = false;
  let version = 0;
  const unsubs = new Map();
  const listeners = new Set();
  const snapshot = () => {
    const s = {};
    for (const panel of DialStore.getPanels("panel")) s[panel.id] = dkClean(DialStore.getValues(panel.id));
    return s;
  };
  const emit = () => {
    version++;
    for (const l of listeners) l();
  };
  const commit = () => {
    clearTimeout(timer);
    if (!pending) return;
    const now = snapshot();
    if (!dkEq(pending, now)) {
      past.push(pending);
      if (past.length > 200) past.shift();
      future = [];
    }
    pending = null;
    last = now;
    emit();
  };
  const onChange = () => {
    if (applying || paused) return;
    if (!pending) {
      pending = last;
      emit();
    }
    clearTimeout(timer);
    timer = setTimeout(commit, 400);
  };
  const sync = () => {
    const ids = new Set(DialStore.getPanels("panel").map((p) => p.id));
    for (const [id, off] of unsubs) {
      if (ids.has(id)) continue;
      off();
      unsubs.delete(id);
    }
    for (const id of ids) {
      if (unsubs.has(id)) continue;
      unsubs.set(id, DialStore.subscribe(id, onChange));
      if (!pending) last = { ...last, [id]: dkClean(DialStore.getValues(id)) };
    }
  };
  const apply = (target) => {
    applying = true;
    try {
      for (const [id, values] of Object.entries(target)) {
        if (!DialStore.getPanel(id)) continue;
        const current = dkClean(DialStore.getValues(id));
        const changes = {};
        for (const [k, v] of Object.entries(values)) if (!dkEq(current[k], v)) changes[k] = v;
        if (Object.keys(changes).length) DialStore.updateValues(id, changes);
      }
    } finally {
      applying = false;
    }
    last = snapshot();
    emit();
  };
  return {
    start() {
      if (started) return;
      started = true;
      last = snapshot();
      sync();
      DialStore.subscribeGlobal(sync);
    },
    undo() {
      if (paused) return;
      commit();
      const prev = past.pop();
      if (!prev) return;
      future.push(snapshot());
      apply(prev);
    },
    redo() {
      if (paused) return;
      commit();
      const next = future.pop();
      if (!next) return;
      past.push(snapshot());
      apply(next);
    },
    snapshot,
    // While a version is previewed, its changes aren't undo steps.
    pause() {
      commit();
      paused = true;
    },
    // Back from a preview; with `before`, the change (a restore) becomes one undo step.
    resume(before) {
      paused = false;
      if (before && !dkEq(before, snapshot())) {
        past.push(before);
        future = [];
      }
      last = snapshot();
      emit();
    },
    canUndo: () => !paused && (past.length > 0 || !!pending),
    canRedo: () => !paused && future.length > 0,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getVersion: () => version
  };
})();

// Saved versions of every panel's values, kept in dial-history.json by the dev server
// (/__dial-history, dialkit-patch/plugin.js). A version is saved:
// - 30 s after the last change made in the panel ("You"),
// - when the page is closed or reloaded with changes not saved yet ("Reload"),
// - on load, when the values differ from the last version, e.g. code changed ("Claude"),
// - when an old version is restored ("Restored").
var DK_HISTORY_ROUTE = "/__dial-history";
var DK_IDLE_MS = 30000;
var DialVersions = (() => {
  let versions = [];
  let available = false;
  let ready = false;
  let dirty = false;
  let previewing = false;
  let idle = 0;
  let settle = 0;
  let version = 0;
  const listeners = new Set();
  const unsubs = new Map();
  const emit = () => {
    version++;
    for (const l of listeners) l();
  };
  const snap = () => {
    const s = {};
    for (const panel of DialStore.getPanels("panel")) s[panel.name] = dkClean(DialStore.getValues(panel.id));
    return s;
  };
  const latest = () => versions[versions.length - 1];
  // Sections not on the page right now (e.g. mid hot-reload) keep their last saved values.
  const full = () => ({ ...(latest()?.values || {}), ...snap() });
  const save = (source, extra) => {
    clearTimeout(idle);
    if (!DialStore.getPanels("panel").length) return; // nothing on the page to save
    dirty = false;
    const values = full();
    const last = latest();
    if (last && source !== "restore" && (dkEq(last.values, values) || !dkDiff(last.values, values).length)) return;
    const v = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), source, values, ...extra };
    versions = [...versions, v];
    const body = JSON.stringify(v);
    if (source === "reload" && navigator.sendBeacon) navigator.sendBeacon(DK_HISTORY_ROUTE, body);
    else fetch(DK_HISTORY_ROUTE, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    emit();
  };
  // Panels load their saved values right after they mount, so wait for the values to settle
  // before comparing them with the last version.
  const onChange = () => {
    if (!available) return;
    if (!ready) {
      clearTimeout(settle);
      settle = setTimeout(settleNow, 2000);
      return;
    }
    if (previewing) return;
    dirty = true;
    clearTimeout(idle);
    idle = setTimeout(() => save("you"), DK_IDLE_MS);
    emit();
  };
  const settleNow = () => {
    if (ready || !DialStore.getPanels("panel").length) return;
    ready = true;
    const last = latest();
    if (!last) save("start");
    else if (!dkEq(last.values, full())) save("claude");
    emit();
  };
  const sync = () => {
    const ids = new Set(DialStore.getPanels("panel").map((p) => p.id));
    for (const id of ids) if (!unsubs.has(id)) unsubs.set(id, DialStore.subscribe(id, onChange));
    onChange();
  };
  const applyByName = (values) => {
    for (const panel of DialStore.getPanels("panel")) {
      const target = values[panel.name];
      if (!target) continue;
      const current = dkClean(DialStore.getValues(panel.id));
      const changes = {};
      for (const [k, v] of Object.entries(target)) if (!dkEq(current[k], v)) changes[k] = v;
      if (Object.keys(changes).length) DialStore.updateValues(panel.id, changes);
    }
  };
  let before = null;
  let beforeById = null;
  return {
    start() {
      if (typeof window === "undefined") return;
      fetch(DK_HISTORY_ROUTE).then((r) => r.ok ? r.json() : Promise.reject()).then((data) => {
        versions = Array.isArray(data?.versions) ? data.versions : [];
        available = true;
        DialStore.subscribeGlobal(sync);
        sync();
        emit();
      }).catch(() => {});
      const flush = () => {
        if (previewing) applyByName(before);
        if (dirty) save("reload");
      };
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && dirty && !previewing) save("reload");
      });
    },
    get: () => versions,
    isAvailable: () => available,
    current: () => full(),
    // Start previewing a version: its values go live (read-only) until done() or restore().
    preview(v) {
      if (!previewing) {
        if (dirty) save("you");
        before = snap();
        beforeById = DialHistory.snapshot();
        DialHistory.pause();
        previewing = true;
      }
      applyByName(v.values);
      emit();
    },
    done() {
      if (!previewing) return;
      applyByName(before);
      previewing = false;
      DialHistory.resume();
      emit();
    },
    restore(v) {
      if (!previewing) return;
      applyByName(v.values);
      previewing = false;
      DialHistory.resume(beforeById);
      save("restore", { from: v.at });
      emit();
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getVersion: () => version
  };
})();
DialVersions.start();

// "Motion · Open · Duration" for a value path, from the panel's control labels.
function dkLabels(panelName) {
  const panel = DialStore.getPanels("panel").find((p) => p.name === panelName);
  const map = new Map();
  const walk = (controls, trail) => {
    for (const c of controls || []) {
      const next = [...trail, c.label];
      map.set(c.path, next);
      if (c.children) walk(c.children, next);
    }
  };
  walk(panel?.controls, []);
  return map;
}
const dkCap = (s) => s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace(/ (\w)/g, (m, c) => " " + c.toLowerCase());
function dkFmt(v) {
  if (v === void 0 || v === null) return "—";
  if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (Array.isArray(v)) return v.map(dkFmt).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
// What changed from one version's values to the next.
function dkDiff(a, b) {
  const out = [];
  // Only sections both versions have (one saved mid hot-reload may lack some).
  const names = Object.keys(b || {}).filter((name) => a && a[name]);
  for (const name of names) {
    const va = a[name];
    const vb = b[name];
    let labels = null;
    const label = (path) => {
      labels = labels || dkLabels(name);
      return labels.get(path) || path.split(".").map(dkCap);
    };
    for (const k of new Set([...Object.keys(va), ...Object.keys(vb)])) {
      if (k.endsWith(".__mode") || dkEq(va[k], vb[k])) continue;
      const x = va[k];
      const y = vb[k];
      const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
      if (isObj(x) || isObj(y)) {
        const ox = isObj(x) ? x : {};
        const oy = isObj(y) ? y : {};
        for (const sub of new Set([...Object.keys(ox), ...Object.keys(oy)])) {
          if (dkEq(ox[sub], oy[sub])) continue;
          out.push({ panel: name, label: [...label(k), dkCap(sub)].join(" · "), from: dkFmt(ox[sub]), to: dkFmt(oy[sub]) });
        }
      } else {
        out.push({ panel: name, label: label(k).join(" · "), from: dkFmt(x), to: dkFmt(y) });
      }
    }
  }
  return out;
}
const DK_SOURCE = { you: "You", reload: "Reload", claude: "Claude", restore: "Restored", start: "First" };
const dkTime = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function dkDay(t) {
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

var DK_ICON_UNDO = ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"];
var DK_ICON_REDO = ["m15 14 5-5-5-5", "M20 9H9.5a5.5 5.5 0 0 0 0 11H13"];
var DK_ICON_MENU = ["M4 7h16", "M4 12h16", "M4 17h16"];
var DK_ICON_HISTORY = ["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5", "M12 7v5l3 2"];
var DK_ICON_LOCK = ["M7 11V8a5 5 0 0 1 10 0v3", "M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z"];
function dkIcon(paths) {
  return jsxDK("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: paths.map((d) => jsxDK("path", { d }, d)) });
}
// Text fields keep the browser's own undo.
function isTextField(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  return !["range", "checkbox", "radio", "button", "submit", "color"].includes(el.type);
}

function DkChanges({ changes, limit, grouped }) {
  if (!changes.length) return jsxDK("div", { className: "dk-hist-meta", children: "No value changes" });
  const shown = limit ? changes.slice(0, limit) : changes;
  const rows = [];
  let lastPanel = null;
  for (const [i, c] of shown.entries()) {
    if (grouped && c.panel !== lastPanel) rows.push(jsxDK("div", { className: "dk-hist-group", children: c.panel }, "g" + i));
    lastPanel = c.panel;
    rows.push(jsxsDK("div", { className: "dk-hist-chg", children: [
      jsxsDK("span", { className: "dk-hist-k", children: [!grouped && jsxsDK("b", { children: [c.panel, " · "] }), c.label] }),
      jsxsDK("span", { className: "dk-hist-d", children: [c.from, " → ", jsxDK("i", { children: c.to })] })
    ] }, i));
  }
  if (limit && changes.length > limit) rows.push(jsxDK("div", { className: "dk-hist-meta", children: `+ ${changes.length - limit} more` }, "more"));
  return jsxDK("div", { className: "dk-hist-changes", children: rows });
}

function DkHistoryList({ onOpen, viewingId }) {
  const versions = DialVersions.get();
  const current = DialVersions.current();
  const [openDays, setOpenDays] = useStateDK(() => new Set(["Today"]));
  if (!DialVersions.isAvailable()) return jsxDK("div", { className: "dk-hist-empty", children: "Version history needs the dev server." });
  if (!versions.length) return jsxDK("div", { className: "dk-hist-empty", children: "No versions yet. One is saved 30 seconds after you stop tuning." });
  const latest = versions[versions.length - 1];
  const unsaved = dkDiff(latest.values, current);
  const days = [];
  for (let i = versions.length - 1; i >= 0; i--) {
    const v = versions[i];
    const day = dkDay(v.at);
    let group = days[days.length - 1];
    if (!group || group.day !== day) {
      group = { day, items: [] };
      days.push(group);
    }
    group.items.push({ v, prev: versions[i - 1] });
  }
  const toggle = (day) => setOpenDays((s) => {
    const n = new Set(s);
    if (n.has(day)) n.delete(day);
    else n.add(day);
    return n;
  });
  return jsxDK("div", { className: "dk-hist", children: days.map((g, gi) => {
    const open = openDays.has(g.day) || gi === 0 && !openDays.size;
    return jsxsDK("div", { className: "dk-hist-day", children: [
      jsxsDK("button", { className: "dk-hist-day-head", "aria-expanded": open, onClick: () => toggle(g.day), children: [
        jsxsDK("span", { children: [g.day, jsxDK("span", { className: "dk-hist-count", children: g.items.length === 1 ? "1 version" : `${g.items.length} versions` })] }),
        jsxDK("svg", { className: "dk-hist-chev", "data-open": open, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: jsxDK("path", { d: ICON_CHEVRON }) })
      ] }),
      open && jsxsDK("div", { className: "dk-hist-items", children: [
        gi === 0 && unsaved.length > 0 && jsxsDK("div", { className: "dk-hist-ver", "data-static": "true", children: [
          jsxsDK("div", { className: "dk-hist-top", children: [jsxDK("span", { className: "dk-hist-time", children: "Now" }), jsxDK("span", { className: "dk-hist-tag", "data-current": "true", children: "Current" })] }),
          jsxDK(DkChanges, { changes: unsaved, limit: 3 })
        ] }),
        g.items.map(({ v, prev }, i) => {
          const isCurrent = gi === 0 && i === 0 && !unsaved.length;
          return jsxsDK("button", { className: "dk-hist-ver", "data-viewing": v.id === viewingId ? "true" : void 0, disabled: isCurrent, onClick: () => onOpen(v, prev), children: [
            jsxsDK("div", { className: "dk-hist-top", children: [
              jsxDK("span", { className: "dk-hist-time", children: dkTime(v.at) }),
              jsxsDK("span", { className: "dk-hist-tags", children: [
                isCurrent && jsxDK("span", { className: "dk-hist-tag", "data-current": "true", children: "Current" }),
                jsxDK("span", { className: "dk-hist-tag", children: DK_SOURCE[v.source] || v.source })
              ] })
            ] }),
            v.source === "restore" && v.from ? jsxDK("div", { className: "dk-hist-meta", children: `Restored ${dkDay(v.from).toLowerCase() === "today" ? "" : dkDay(v.from) + ", "}${dkTime(v.from)}` }) : null,
            prev ? jsxDK(DkChanges, { changes: dkDiff(prev.values, v.values), limit: 3 }) : jsxDK("div", { className: "dk-hist-meta", children: "First saved version" })
          ] }, v.id);
        })
      ] })
    ] }, g.day);
  }) });
}

// Blick patch: easing controls pick one of the project's curves by name instead of four bézier
// numbers (the curve drawing stays). Custom shows the numbers, e.g. for a one-off curve.
var DK_EASES = [
  { label: "Ease", ease: [0.45, 0, 0.15, 1] },
  { label: "Ease in", ease: [0.7, 0, 0.75, 1] },
  { label: "Ease out", ease: [0.22, 1, 0.36, 1] }
];
function DkEaseCurve({ ease, onChange }) {
  const match = DK_EASES.find((p) => p.ease.every((v, i) => Math.abs(v - (ease?.[i] ?? NaN)) < 1e-3));
  const [custom, setCustom] = useStateDK(!match);
  const showCustom = custom || !match;
  // A dropdown like the other selects (four segments didn't fit the panel's width).
  return jsxsDK("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [
    jsxDK(SelectControl, {
      label: "Curve",
      options: [...DK_EASES.map((p) => ({ value: p.label, label: p.label })), { value: "Custom", label: "Custom" }],
      value: showCustom ? "Custom" : match.label,
      onChange: (v) => {
        if (v === "Custom") return setCustom(true);
        setCustom(false);
        onChange([...DK_EASES.find((p) => p.label === v).ease]);
      }
    }),
    showCustom && jsxDK(EaseTextInput, { ease, onChange })
  ] });
}

// Blick patch: the order of the sections, set by dragging them in the sections menu; kept in
// localStorage by name. DialRoot (plugin.js) and this toolbar both sort the panels by it.
var DkOrder = (() => {
  const KEY = "dialkit-panel-order";
  let order = [];
  try {
    order = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {}
  const subs = new Set();
  return {
    get: () => order,
    set: (names) => {
      order = names;
      try {
        localStorage.setItem(KEY, JSON.stringify(names));
      } catch {}
      subs.forEach((f) => f());
    },
    subscribe: (f) => {
      subs.add(f);
      return () => subs.delete(f);
    }
  };
})();
const useDkOrder = () => useSESDK(DkOrder.subscribe, DkOrder.get, DkOrder.get);
const dkSortCache = new WeakMap();
/** The panels in the saved order (ones not in it yet keep their place after the ones that are). */
function dkSortPanels(panels, order) {
  const hit = dkSortCache.get(panels);
  if (hit && hit.order === order) return hit.out;
  const rank = new Map(order.map((name, i) => [name, i]));
  const out = panels.map((p, i) => ({ p, k: rank.has(p.name) ? rank.get(p.name) : 1e6 + i })).sort((a, b) => a.k - b.k).map((x) => x.p);
  dkSortCache.set(panels, { order, out });
  return out;
}

function RootToolbar({ extra }) {
  const ref = useRefDK(null);
  const [open, setOpen] = useStateDK(false);
  const [active, setActive] = useStateDK(null);
  const [copied, setCopied] = useStateDK(false);
  // The version list (a dropdown) and the version being previewed ({ version, prev }).
  const [listOpen, setListOpen] = useStateDK(false);
  const [history, setHistory] = useStateDK(null);
  const [dropSize, setDropSize] = useStateDK(null);
  const [slots, setSlots] = useStateDK(null);
  const copyTimeout = useRefDK();
  useEffectDK(() => DialHistory.start(), []);
  useSESDK(DialHistory.subscribe, DialHistory.getVersion, DialHistory.getVersion);
  useSESDK(DialVersions.subscribe, DialVersions.getVersion, DialVersions.getVersion);
  const order = useDkOrder();
  const panels = dkSortPanels(DialStore.getPanels("panel"), order);
  // Dragging a section in the menu: the ids in their new order while the drag lasts.
  const [dragIds, setDragIds] = useStateDK(null);
  const drag = useRefDK(null);
  const justDragged = useRefDK(false);
  const viewing = history;
  const canUndo = DialHistory.canUndo();
  const canRedo = DialHistory.canRedo();

  // ⌘Z undo, ⇧⌘Z / ⌘Y redo (Ctrl on Windows). Escape leaves the history.
  const historyRef = useRefDK(history);
  historyRef.current = history;
  const listRef = useRefDK(listOpen);
  listRef.current = listOpen;
  useEffectDK(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && listRef.current) {
        setListOpen(false);
        return;
      }
      if (e.key === "Escape" && historyRef.current) {
        closeHistory();
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const redo = key === "z" && e.shiftKey || key === "y" && !e.shiftKey;
      const undo = key === "z" && !e.shiftKey;
      if (!undo && !redo) return;
      if (isTextField(document.activeElement)) return;
      e.preventDefault();
      if (redo) DialHistory.redo();
      else DialHistory.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Leaving the panel (closing it) ends a preview without changing anything.
  useEffectDK(() => () => DialVersions.done(), []);

  const rootFolder = () => ref.current?.closest(".dialkit-folder-root");
  const sections = () => {
    const root = rootFolder();
    if (!root) return [];
    return Array.from(root.querySelectorAll(":scope > .dialkit-folder-content > .dialkit-folder-inner > .dialkit-folder"));
  };
  const scroller = () => ref.current?.closest(".dialkit-panel-inner") ?? null;
  const headerBottom = () => ref.current?.closest(".dialkit-panel-header")?.getBoundingClientRect().bottom ?? 0;

  // While a version is previewed, its banner and Restore/Done render into slots at the top and
  // bottom of the panel's content, and the controls are read-only.
  useLayoutEffectDK(() => {
    const root = rootFolder();
    if (!history || !root) {
      setSlots(null);
      return;
    }
    root.dataset.dkHistory = "view";
    const inner = root.querySelector(":scope > .dialkit-folder-content > .dialkit-folder-inner");
    if (!inner) return;
    const top = document.createElement("div");
    top.className = "dk-slot dk-slot-top";
    const bottom = document.createElement("div");
    bottom.className = "dk-slot dk-slot-bottom";
    inner.prepend(top);
    inner.append(bottom);
    setSlots({ top, bottom });
    scroller()?.scrollTo({ top: 0 });
    return () => {
      delete root.dataset.dkHistory;
      top.remove();
      bottom.remove();
    };
  }, [!!history]);

  // The version list drops down from the toolbar, as wide as the toolbar and no taller than the
  // room left in the panel, so the panel itself never changes size.
  useLayoutEffectDK(() => {
    if (!listOpen) return;
    const measure = () => {
      const bar = ref.current?.getBoundingClientRect();
      const box = scroller()?.getBoundingClientRect();
      if (!bar || !box) return;
      setDropSize({ width: bar.width, maxHeight: Math.max(160, box.bottom - bar.bottom - 14) });
    };
    measure();
    const onDown = (e) => {
      if (!e.target.closest?.(".dk-hist-wrap")) setListOpen(false);
    };
    window.addEventListener("resize", measure);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("resize", measure);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [listOpen]);

  const closeHistory = () => {
    DialVersions.done();
    setHistory(null);
  };
  const openVersion = (version, prev) => {
    setListOpen(false);
    DialVersions.preview(version);
    setHistory({ version, prev });
  };
  const toggleHistory = () => setListOpen((o) => !o);

  // The active section is the one under the pinned header.
  useEffectDK(() => {
    const el = scroller();
    if (!el) return;
    const update = () => {
      const list = sections();
      const line = headerBottom() + 1;
      let index = list.length ? 0 : -1;
      list.forEach((s, i) => {
        if (s.getBoundingClientRect().top <= line) index = i;
      });
      const panel = dkSortPanels(DialStore.getPanels("panel"), DkOrder.get())[index];
      setActive(panel ? panel.id : null);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [panels.length, order]);

  useEffectDK(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const jumpTo = (index) => {
    const panel = panels[index];
    setOpen(false);
    if (!panel) return;
    DialStore.setPanelOpen(panel.id, true);
    requestAnimationFrame(() => {
      const el = scroller();
      const section = sections()[index];
      if (!el || !section) return;
      const top = section.getBoundingClientRect().top - headerBottom() + el.scrollTop;
      el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  };

  const handleCopy = async () => {
    const text = panels.map((panel) => buildCopyInstruction("useDialKit", panel.name, DialStore.getValues(panel.id))).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCopied(false), 1500);
  };

  const clipboard = jsxsDK("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [
    jsxDK("path", { d: ICON_CLIPBOARD_PLAIN.board, stroke: "currentColor", strokeWidth: "2", strokeLinejoin: "round" }),
    jsxDK("path", { d: ICON_CLIPBOARD_PLAIN.body, stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" })
  ] });

  const viewDay = viewing ? dkDay(viewing.version.at) : "";
  const banner = viewing && jsxsDK("div", { className: "dk-hist-banner", children: [
    jsxsDK("div", { className: "dk-hist-top", children: [
      jsxDK("span", { className: "dk-hist-time", children: `${viewDay}, ${dkTime(viewing.version.at)}` }),
      jsxsDK("span", { className: "dk-hist-ro", children: [dkIcon(DK_ICON_LOCK), "Read-only"] })
    ] }),
    viewing.prev ? jsxDK(DkChanges, { changes: dkDiff(viewing.prev.values, viewing.version.values), grouped: true }) : jsxDK("div", { className: "dk-hist-meta", children: "First saved version" })
  ] });
  const footer = viewing && jsxsDK("div", { className: "dk-hist-foot", children: [
    jsxDK("button", { className: "dk-hist-act", onClick: () => {
      DialVersions.restore(viewing.version);
      setHistory(null);
    }, children: "Restore" }),
    jsxDK("button", { className: "dk-hist-act", "data-primary": "true", onClick: closeHistory, children: "Done" })
  ] });

  return jsxsDK("div", { ref, className: "dialkit-root-toolbar", children: [
    jsxDK("button", { className: "dialkit-toolbar-add", title: copied ? "Copied" : "Copy parameters", "aria-label": copied ? "Copied parameters" : "Copy parameters", onClick: handleCopy, children: copied ? dkIcon([ICON_CHECK]) : clipboard }),
    jsxDK("span", { className: "dialkit-root-toolbar-divider", "aria-hidden": "true" }),
    jsxDK("button", { className: "dialkit-toolbar-add", title: "Undo (⌘Z)", "aria-label": "Undo", disabled: !canUndo || !!history, onClick: () => DialHistory.undo(), children: dkIcon(DK_ICON_UNDO) }),
    jsxDK("button", { className: "dialkit-toolbar-add", title: "Redo (⇧⌘Z)", "aria-label": "Redo", disabled: !canRedo || !!history, onClick: () => DialHistory.redo(), children: dkIcon(DK_ICON_REDO) }),
    jsxDK("button", { className: "dialkit-toolbar-add dk-hist-wrap", title: "Version history", "aria-label": "Version history", "aria-haspopup": "dialog", "aria-expanded": listOpen, "aria-pressed": listOpen || !!history, onClick: toggleHistory, children: dkIcon(DK_ICON_HISTORY) }),
    listOpen && jsxDK("div", { className: "dialkit-root-menu-list dk-hist-drop dk-hist-wrap", style: dropSize ? { width: dropSize.width, maxHeight: dropSize.maxHeight } : void 0, children: jsxDK(DkHistoryList, { onOpen: openVersion, viewingId: history?.version.id }) }),
    panels.length > 1 && jsxDK("span", { className: "dialkit-root-toolbar-divider", "aria-hidden": "true" }),
    panels.length > 1 && jsxsDK("div", { className: "dialkit-root-menu", children: [
      jsxDK("button", { className: "dialkit-toolbar-add", title: "Sections", "aria-label": "Sections", "aria-haspopup": "menu", "aria-expanded": open, "aria-pressed": open, onClick: () => setOpen((o) => !o), children: dkIcon(DK_ICON_MENU) }),
      open && jsxDK("div", { className: "dialkit-root-menu-list", role: "menu", children: (dragIds ? dragIds.map((id) => panels.find((p) => p.id === id)).filter(Boolean) : panels).map((panel) => jsxsDK("button", {
        role: "menuitem",
        className: "dialkit-root-menu-item",
        "data-active": panel.id === active ? "true" : void 0,
        "data-dragging": dragIds && drag.current?.id === panel.id ? "true" : void 0,
        // Drag a section up or down to move it (the sections below follow); a click jumps to it.
        onPointerDown: (e) => {
          if (e.button !== 0) return;
          drag.current = { id: panel.id, y: e.clientY, moved: false };
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
        },
        onPointerMove: (e) => {
          const d = drag.current;
          if (!d) return;
          if (!d.moved && Math.abs(e.clientY - d.y) < 4) return;
          d.moved = true;
          const items = Array.from(e.currentTarget.parentElement.children);
          const ids = (dragIds ?? panels.map((p) => p.id)).filter((id) => id !== d.id);
          let at = ids.length;
          const others = items.filter((el) => el !== e.currentTarget);
          for (let k = 0; k < others.length; k++) {
            const r = others[k].getBoundingClientRect();
            if (e.clientY < r.top + r.height / 2) {
              at = k;
              break;
            }
          }
          ids.splice(at, 0, d.id);
          setDragIds(ids);
        },
        onPointerUp: () => {
          const d = drag.current;
          drag.current = null;
          if (!d?.moved) return;
          justDragged.current = true;
          if (dragIds) DkOrder.set(dragIds.map((id) => panels.find((p) => p.id === id)?.name).filter(Boolean));
          setDragIds(null);
        },
        onPointerCancel: () => {
          drag.current = null;
          setDragIds(null);
        },
        onClick: () => {
          if (justDragged.current) {
            justDragged.current = false;
            return;
          }
          jumpTo(panels.findIndex((p) => p.id === panel.id));
        },
        children: [
          jsxDK("span", { children: panel.name }),
          panel.id === active && dkIcon([ICON_CHECK])
        ]
      }, panel.id)) })
    ] }),
    extra,
    slots && viewing && createPortalDK(banner, slots.top),
    slots && viewing && createPortalDK(footer, slots.bottom)
  ] });
}

