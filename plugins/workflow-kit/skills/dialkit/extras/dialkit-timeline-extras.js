// DialKit timeline extras — vanilla JS, written against dialkit@2.0.x's timeline dock.
//
//   createManagedTimeline  plain from/to clips become one-step sequences (2.0.2's clip editor shows a
//                          plain clip's "From" twice); user groups (⌘G) that show up as real dock groups,
//                          keeping every value edited in the dock; clip(key) reads clips by their
//                          original config key wherever they've been grouped.
//   enhanceDock            ⌘/Ctrl-click multi-select, ⌘-click a group row, marquee-drag on empty lanes,
//                          drag/stretch moves the whole selection (a lone clip in a group moves alone;
//                          drag the group bar to move the group), Esc clears,
//                          ⌘G groups / ⌘⇧G ungroups, a Jitter-style summary bar on every group row
//                          (drag = move the group, drag an edge = stretch its timing, click = select it),
//                          clicking an open clip again closes its editor, and the dock keeps its scroll
//                          across re-renders.
//   bindSpaceKey           Space plays/pauses (from the end it starts over), double-tap restarts.
//   persistTimeline        saves every dock edit + the user groups to dial-values.json (the skill's
//                          dial-values.plugin.js endpoint) and restores them on load.
//
// Pass DialKit's own exports in (`import * as dialkit from 'dialkit/vanilla'`): each entry point bundles
// its own stores, so importing them here could bind to a different instance than the app's.

const r3 = (n) => Math.round(n * 1000) / 1000;
const r2 = (n) => Math.round(n * 100) / 100; // DialKit's own clip drags snap to 0.01s
const isClip = (o) => !!o && typeof o === 'object' && 'at' in o;
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const MOD = (e) => e.metaKey || e.ctrlKey;
const TYPING = 'input, textarea, select, [contenteditable="true"]';

function toSequence(clip) {
  if (!isClip(clip) || clip.steps || clip.props || !clip.to) return clip;
  const { to, duration, transition, ...rest } = clip;
  const d = duration ?? transition?.duration ?? 0.3;
  return { ...rest, steps: [{ duration: d, to, ...(transition ? { transition } : {}) }] };
}

function normalize(config) {
  const out = {};
  for (const [k, v] of Object.entries(config)) {
    if (k === 'duration' || !v || typeof v !== 'object') out[k] = v;
    else if (isClip(v)) out[k] = toSequence(v);
    else out[k] = Object.fromEntries(Object.entries(v).map(([ck, cv]) => [ck, toSequence(cv)]));
  }
  return out;
}

/** Original clip keys in config order: "panel" for a top-level clip, "open.panel" for a grouped one. */
function clipKeys(config) {
  return Object.entries(config).flatMap(([k, v]) => (k === 'duration' || !v || typeof v !== 'object'
    ? [] : isClip(v) ? [k] : Object.keys(v).filter((ck) => isClip(v[ck])).map((ck) => `${k}.${ck}`)));
}

const resolve = (obj, path) => path.split('.').reduce((o, p) => o?.[p], obj);

export function createManagedTimeline(dialkit, name, baseConfig, { groups: defaultGroups = [], ...options } = {}) {
  const { createDialTimeline, DialStore } = dialkit;
  let base = baseConfig;
  // [{ id: 'groupA', keys: ['open.trade', …] }] — `groups` in the options are baked-in defaults (reset() returns to them)
  const cloneGroups = (list) => list.map((g) => ({ id: g.id, keys: [...g.keys] }));
  let groups = cloneGroups(defaultGroups);
  let pathMap = {}; // original key → current path, for clips moved into a user group
  let timeline = null;
  let unsubscribeStore = null;
  const frameListeners = new Set();
  const mountListeners = new Set();
  const changeListeners = new Set();
  const emitChange = () => changeListeners.forEach((fn) => fn());

  // Flat store values ("groupA.trade.at") ↔ original keys ("open.trade.at"), so saved state survives
  // regrouping. Longest paths first so "open.panelX" never matches "open.panel".
  function toOriginal(values, map) {
    const keys = clipKeys(normalize(base)).sort((x, y) => (map[y] ?? y).length - (map[x] ?? x).length);
    const out = {};
    for (const [path, value] of Object.entries(values)) {
      const key = keys.find((k) => { const p = map[k] ?? k; return path === p || path.startsWith(`${p}.`); });
      if (key) out[key + path.slice((map[key] ?? key).length)] = value;
    }
    return out;
  }
  function fromOriginal(values) {
    const keys = clipKeys(normalize(base)).sort((x, y) => y.length - x.length);
    const out = {};
    for (const [path, value] of Object.entries(values)) {
      const key = keys.find((k) => path === k || path.startsWith(`${k}.`));
      if (key) out[(pathMap[key] ?? key) + path.slice(key.length)] = value;
    }
    return out;
  }

  function build() {
    const cfg = normalize(base);
    const order = clipKeys(cfg);
    const pool = {};
    const top = {};
    for (const [k, v] of Object.entries(cfg)) {
      if (k === 'duration') continue;
      if (isClip(v)) top[k] = v;
      else pool[k] = { ...v };
    }
    pathMap = {};
    const take = (key) => {
      const [a, b] = key.split('.');
      if (b === undefined) { const c = top[a]; delete top[a]; return c; }
      const c = pool[a]?.[b]; if (pool[a]) delete pool[a][b]; return c;
    };
    const built = groups.map((g) => {
      const clips = {};
      for (const key of [...g.keys].sort((x, y) => order.indexOf(x) - order.indexOf(y))) {
        const clip = take(key);
        if (!clip) continue;
        const [a, b] = key.split('.');
        let n = b ?? a;
        if (clips[n]) n = `${a}${n[0].toUpperCase()}${n.slice(1)}`;
        clips[n] = clip;
        pathMap[key] = `${g.id}.${n}`;
      }
      return { id: g.id, clips, anchor: g.keys.map((k) => k.split('.')[0]).sort((x, y) => order.findIndex((o) => o.startsWith(x)) - order.findIndex((o) => o.startsWith(y)))[0] };
    }).filter((g) => Object.keys(g.clips).length);
    groups = groups.filter((g) => built.some((b) => b.id === g.id));

    const out = {};
    if (cfg.duration !== undefined) out.duration = cfg.duration;
    for (const k of Object.keys(cfg)) {
      if (k === 'duration') continue;
      if (k in top) out[k] = top[k];
      else if (pool[k] && Object.keys(pool[k]).length) out[k] = pool[k];
      for (const b of built.filter((x) => x.anchor === k)) out[b.id] = b.clips;
    }
    return out;
  }

  /** Write values (keyed by original clip key) into the live store; paths the current config doesn't
   * have (e.g. a property a different entrance style doesn't animate) are skipped. */
  function applyValues(original) {
    const live = DialStore.getValues(timeline.id);
    const updates = Object.fromEntries(Object.entries(fromOriginal(original)).filter(([p]) => p in live));
    if (Object.keys(updates).length) DialStore.updateValues(timeline.id, updates);
  }

  function mount({ carry = false, values = null } = {}) {
    const at = timeline ? timeline.getValues().time : 0;
    const carried = carry && timeline ? toOriginal(DialStore.getValues(timeline.id), { ...pathMap }) : null;
    unsubscribeStore?.();
    timeline?.destroy();
    const config = build();
    timeline = createDialTimeline(name, config, { autoplay: false, ...options });
    if (carried) applyValues(carried);
    if (values) applyValues(values);
    timeline.subscribe((v) => frameListeners.forEach((fn) => fn(v)), true);
    timeline.seek(Math.min(at, timeline.getValues().duration));
    unsubscribeStore = DialStore.subscribe(timeline.id, emitChange);
    mountListeners.forEach((fn) => fn(api));
    emitChange();
  }

  const api = {
    get timeline() { return timeline; },
    get id() { return timeline.id; },
    get groups() { return groups.map((g) => ({ ...g, keys: [...g.keys] })); },
    /** Live values of a clip by its original config key, wherever it's been grouped. */
    clip(key, values = timeline.getValues()) { return resolve(values, pathMap[key] ?? key); },
    keys() { return clipKeys(normalize(base)); },
    /** Current dock path → original key. */
    originalKey(path) { return Object.keys(pathMap).find((k) => pathMap[k] === path) ?? path; },
    isUserGroup(groupId) { return groups.some((g) => g.id === groupId); },
    onFrame(fn) { frameListeners.add(fn); if (timeline) fn(timeline.getValues()); return () => frameListeners.delete(fn); },
    onMount(fn) { mountListeners.add(fn); return () => mountListeners.delete(fn); },
    /** New base config with fresh values (dock edits reset); user groups are kept. */
    setConfig(next) { base = next; mount(); },
    /** Everything edited in the dock, keyed by original clip keys, plus the user groups — for saving. */
    getState() {
      return { groups: api.groups, values: toOriginal(DialStore.getValues(timeline.id), pathMap) };
    },
    /** Restore a getState() snapshot onto the current config. Unknown clips/paths are ignored. */
    setState(state) {
      const known = new Set(api.keys());
      groups = (state?.groups ?? [])
        .map((g) => ({ id: g.id, keys: g.keys.filter((k) => known.has(k)) }))
        .filter((g) => /^group[A-Z]$/.test(g.id) && g.keys.length > 1);
      mount({ values: state?.values ?? {} });
    },
    /** Drop dock edits and user groups: back to the base config and the default groups. */
    reset() { groups = cloneGroups(defaultGroups); mount(); },
    /** Fires after any dock edit, group change or remount (debounce before doing anything heavy). */
    onChange(fn) { changeListeners.add(fn); return () => changeListeners.delete(fn); },
    /** Group clips by their current dock paths. Values edited in the dock carry over. */
    group(paths) {
      const keys = [...new Set(paths.map((p) => api.originalKey(p)))];
      if (keys.length < 2) return null;
      groups = groups.map((g) => ({ ...g, keys: g.keys.filter((k) => !keys.includes(k)) })).filter((g) => g.keys.length > 1);
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const id = `group${[...letters].find((l) => !groups.some((g) => g.id === `group${l}`))}`;
      groups.push({ id, keys });
      mount({ carry: true });
      return id;
    },
    /** Dissolve every user group touched by these dock paths. */
    ungroup(paths) {
      const keys = paths.map((p) => api.originalKey(p));
      const before = groups.length;
      groups = groups.filter((g) => !g.keys.some((k) => keys.includes(k)));
      if (groups.length !== before) mount({ carry: true });
    },
    play: () => timeline.play(),
    pause: () => timeline.pause(),
    replay: () => timeline.replay(),
    seek: (t) => timeline.seek(t),
    getValues: () => timeline.getValues(),
    togglePlay() {
      const v = timeline.getValues();
      if (v.playing) timeline.pause();
      else if (v.time >= v.duration - 0.01) timeline.replay();
      else timeline.play();
    },
  };
  mount();
  return api;
}

/**
 * Save the dock state (every edited clip value + user groups) to disk through the dev-only
 * `/__dial-values` endpoint from the dialkit skill's dial-values.plugin.js — same file and shape as the
 * panel autosave (`panels[name] = state`). Call `restore()` once the panel's own saved values have been
 * applied (a panel change remounts the timeline with fresh values). Nothing is written until a restore
 * has reached the endpoint, so a failed load never overwrites the file with defaults.
 */
export function persistTimeline(managed, name, { route = '/__dial-values', delay = 300 } = {}) {
  let enabled = false;
  let timer;
  window.__dial = window.__dial || {};
  window.__dial[name] = () => managed.getState();
  managed.onChange(() => {
    if (!enabled) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, values: managed.getState() }),
      }).catch(() => {});
    }, delay);
  });
  return {
    async restore() {
      try {
        const res = await fetch(route);
        if (!res.ok) return false;
        const saved = (await res.json()).panels?.[name];
        if (saved) managed.setState(saved);
        enabled = true;
        return true;
      } catch {
        return false; // no endpoint (production build / static hosting)
      }
    },
  };
}

/** Space plays/pauses; a double-tap restarts from 0. `before` runs first (e.g. to cancel a segment stop). */
export function bindSpaceKey(managed, { doubleTapMs = 300, before } = {}) {
  let last = 0;
  const onKey = (e) => {
    if (e.code !== 'Space' || e.repeat || e.target.closest?.(TYPING)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const now = performance.now();
    const double = now - last < doubleTapMs;
    last = double ? 0 : now;
    before?.();
    if (double) managed.replay();
    else managed.togglePlay();
  };
  addEventListener('keydown', onKey, true); // capture: beats "press the focused button" / page scroll
  return () => removeEventListener('keydown', onKey, true);
}

export function enhanceDock(dialkit, dockRoot, managed, { accent = '#dd6e36' } = {}) {
  const { DialStore, TimelineStore } = dialkit;
  const selected = new Set();
  let meta = null;
  let prev = {};
  let applying = false;
  let unsubscribe = null;

  const style = document.createElement('style');
  style.textContent = `
    .dialkit-timeline-clip[data-multi] { box-shadow: 0 0 0 2px ${accent}, 0 0 0 4px color-mix(in srgb, ${accent} 25%, transparent); }
    .dialkit-timeline-row[data-multi-group] > .dialkit-timeline-label { color: ${accent}; }
    .dialkit-timeline-row[data-user-group] > .dialkit-timeline-label::after { content: '  ⇧⌘G ungroup'; opacity: 0.35; font-size: 0.8em; white-space: pre; }
    .dk-marquee { position: fixed; z-index: 2147483000; pointer-events: none; border: 1px solid ${accent};
      background: color-mix(in srgb, ${accent} 12%, transparent); border-radius: 2px; }
    .dk-group-bar { position: absolute; top: 50%; transform: translateY(-50%); height: var(--dk-bar-h, 20px); min-width: 14px;
      box-sizing: border-box; border-radius: 6px; background: color-mix(in srgb, currentColor 30%, transparent);
      color: inherit; cursor: grab; touch-action: none; transition: background 150ms cubic-bezier(0.4, 0, 0.3, 1); }
    .dk-group-bar:hover { background: color-mix(in srgb, currentColor 42%, transparent); }
    .dk-group-bar[data-active] { background: ${accent}; color: #fff; }
    .dk-group-bar[data-dragging] { cursor: grabbing; }
    .dk-group-bar > .dk-edge { position: absolute; top: 0; bottom: 0; width: 8px; cursor: ew-resize; }
    .dk-group-bar > .dk-edge[data-edge="start"] { left: -2px; }
    .dk-group-bar > .dk-edge[data-edge="end"] { right: -2px; }
    .dk-group-bar > .dk-span { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); pointer-events: none;
      font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; opacity: 0.75; white-space: nowrap; }`;
  document.head.append(style);

  // ── rows ↔ clips ────────────────────────────────────────────────────────────
  function rows() {
    if (!meta) return [];
    let group;
    const out = [];
    dockRoot.querySelectorAll('.dialkit-timeline-row').forEach((row) => {
      if (row.classList.contains('dialkit-timeline-ruler-row')) return;
      const label = row.querySelector('.dialkit-timeline-label')?.textContent.trim();
      if (!label) return;
      if (row.classList.contains('dialkit-timeline-group-row')) {
        group = meta.clips.find((c) => c.group && norm(c.group) === norm(label))?.group;
        out.push({ row, groupRow: group });
        return;
      }
      const g = row.hasAttribute('data-grouped') ? group : undefined;
      const clip = meta.clips.find((c) => c.label === label && c.group === g);
      if (clip) out.push({ row, key: clip.key, node: row.querySelector('.dialkit-timeline-clip') });
    });
    return out;
  }
  const groupMembers = (groupId) => meta.clips.filter((c) => c.group === groupId).map((c) => c.key);
  const groupOf = (key) => meta.clips.find((c) => c.key === key)?.group;

  function paint() {
    for (const { row, key, groupRow, node } of rows()) {
      if (groupRow) {
        const keys = groupMembers(groupRow);
        row.toggleAttribute('data-multi-group', keys.length > 0 && keys.every((k) => selected.has(k)));
        row.toggleAttribute('data-user-group', managed.isUserGroup(groupRow));
      } else if (node) node.toggleAttribute('data-multi', selected.has(key));
    }
    paintBars();
  }

  // ── linked drag / stretch ───────────────────────────────────────────────────
  const durationPath = (key) => {
    const clip = meta.clips.find((c) => c.key === key);
    return clip?.stepKeys?.length ? `${key}.${clip.stepKeys[0]}.duration` : `${key}.duration`;
  };
  function snapshot() {
    if (!meta) return;
    const v = DialStore.getValues(meta.id);
    prev = Object.fromEntries(meta.clips.map((c) => [c.key, { at: v[`${c.key}.at`], duration: v[durationPath(c.key)] }]));
  }
  function onValues() {
    if (applying || !meta) return;
    const v = DialStore.getValues(meta.id);
    const changed = meta.clips.map((c) => c.key).filter((k) => prev[k] && (v[`${k}.at`] !== prev[k].at || v[durationPath(k)] !== prev[k].duration));
    if (changed.length === 1) {
      const lead = changed[0];
      // Only an explicit multi-selection moves together. A clip inside a group moves on its own and
      // the group bar adapts; the whole group moves with its bar.
      const linked = new Set(selected.has(lead) && selected.size > 1 ? selected : []);
      linked.delete(lead);
      if (linked.size) {
        const dAt = v[`${lead}.at`] - prev[lead].at;
        const dDur = v[durationPath(lead)] - prev[lead].duration;
        const updates = {};
        for (const k of linked) {
          if (!prev[k]) continue;
          if (dAt) updates[`${k}.at`] = Math.max(0, r3(prev[k].at + dAt));
          if (dDur) updates[durationPath(k)] = Math.max(0.02, r3(prev[k].duration + dDur));
        }
        applying = true;
        DialStore.updateValues(meta.id, updates);
        applying = false;
      }
    }
    snapshot();
  }

  // ── group summary bars (Jitter-style) ───────────────────────────────────────
  // Seconds → lane x: px/second from the ruler's tick labels; the t=0 offset from a visible clip
  // (DialKit positions clips at (at - viewStart) * px), or from the "0s"-style labels when every
  // group is collapsed.
  function timeScale() {
    const ticks = [...dockRoot.querySelectorAll('.dialkit-timeline-tick-label')]
      .map((e) => ({ t: parseFloat(e.textContent), x: e.getBoundingClientRect().left }))
      .filter((o) => Number.isFinite(o.t));
    if (ticks.length < 2 || ticks[1].t === ticks[0].t) return null;
    const px = (ticks[1].x - ticks[0].x) / (ticks[1].t - ticks[0].t);
    const v = DialStore.getValues(meta.id);
    const visible = rows().find((r) => r.node && Number.isFinite(parseFloat(r.node.style.left)));
    if (visible) return { px, x0: parseFloat(visible.node.style.left) - v[`${visible.key}.at`] * px };
    const lane = dockRoot.querySelector('.dialkit-timeline-row:not(.dialkit-timeline-ruler-row) .dialkit-timeline-lane');
    if (!lane) return null;
    return { px, x0: ticks[0].x - 4 - lane.getBoundingClientRect().left - ticks[0].t * px };
  }

  function groupSpan(groupId, v = DialStore.getValues(meta.id)) {
    const keys = groupMembers(groupId);
    const clips = keys.map((k) => ({ key: k, at: v[`${k}.at`], duration: v[durationPath(k)] })).filter((c) => Number.isFinite(c.at) && Number.isFinite(c.duration));
    if (!clips.length) return null;
    const start = Math.min(...clips.map((c) => c.at));
    const end = Math.max(...clips.map((c) => c.at + c.duration));
    return { clips, start, end };
  }

  function paintBars() {
    const scale = timeScale();
    if (!scale) return;
    const clipH = dockRoot.querySelector('.dialkit-timeline-clip')?.offsetHeight;
    for (const { row, groupRow } of rows()) {
      if (!groupRow) continue;
      const lane = row.querySelector('.dialkit-timeline-lane');
      const span = groupSpan(groupRow);
      if (!lane || !span) continue;
      let bar = lane.querySelector(':scope > .dk-group-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'dk-group-bar';
        bar.innerHTML = '<span class="dk-span"></span><div class="dk-edge" data-edge="start"></div><div class="dk-edge" data-edge="end"></div>';
        lane.append(bar);
      }
      bar.dataset.group = groupRow;
      const left = `${(scale.x0 + span.start * scale.px).toFixed(1)}px`;
      const width = `${Math.max(14, (span.end - span.start) * scale.px).toFixed(1)}px`;
      if (bar.style.left !== left) bar.style.left = left;
      if (bar.style.width !== width) bar.style.width = width;
      if (clipH) bar.style.setProperty('--dk-bar-h', `${clipH}px`);
      const label = (span.end - span.start) * scale.px > 56 ? `${r3(span.end - span.start)}s` : '';
      const text = bar.querySelector('.dk-span');
      if (text.textContent !== label) text.textContent = label;
      const members = groupMembers(groupRow);
      bar.toggleAttribute('data-active', members.length > 0 && members.every((k) => selected.has(k)));
    }
  }

  // Drag the bar = move every clip in the group; drag an edge = stretch the group's timing around the
  // opposite edge (starts and durations scale together); a click without moving selects the group.
  function startGroupDrag(e, bar) {
    const groupId = bar.dataset.group;
    const scale = timeScale();
    const span = groupSpan(groupId);
    if (!scale || !span) return;
    const mode = e.target.closest('.dk-edge')?.dataset.edge ?? 'move';
    const x0 = e.clientX;
    const length = span.end - span.start;
    let moved = false;
    const move = (ev) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      bar.setAttribute('data-dragging', '');
      const dt = dx / scale.px;
      const updates = {};
      if (mode === 'move') {
        const shift = Math.max(-span.start, dt);
        for (const c of span.clips) updates[`${c.key}.at`] = r2(c.at + shift);
      } else {
        const next = Math.max(0.05, mode === 'end' ? length + dt : length - dt);
        const f = next / length;
        const anchor = mode === 'end' ? span.start : span.end;
        for (const c of span.clips) {
          const at = mode === 'end' ? anchor + (c.at - anchor) * f : anchor - (anchor - c.at) * f;
          updates[`${c.key}.at`] = r2(Math.max(0, at));
          updates[durationPath(c.key)] = r2(Math.max(0.02, c.duration * f));
        }
      }
      DialStore.updateValues(meta.id, updates);
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      bar.removeAttribute('data-dragging');
      if (!moved) {
        const keys = groupMembers(groupId);
        const all = keys.every((k) => selected.has(k));
        if (!(e.shiftKey || MOD(e))) selected.clear();
        keys.forEach((k) => (all && (e.shiftKey || MOD(e)) ? selected.delete(k) : selected.add(k)));
        paint();
      }
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
  }

  // ── clicking the clip whose editor is open closes it (DialKit would reopen it) ─────
  let reclick = null;
  addEventListener('pointerup', (e) => {
    if (!reclick) return;
    const { x, y } = reclick;
    reclick = null;
    if (Math.hypot(e.clientX - x, e.clientY - y) > 3) return; // that was a drag, keep the editor
    setTimeout(() => {
      document.querySelector('.dialkit-timeline-popover')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    }, 0);
  }, true);

  // ── selection input ─────────────────────────────────────────────────────────
  function toggleRow(row) {
    const hit = rows().find((r) => r.row === row);
    if (!hit) return;
    if (hit.groupRow) {
      const keys = groupMembers(hit.groupRow);
      const all = keys.every((k) => selected.has(k));
      keys.forEach((k) => (all ? selected.delete(k) : selected.add(k)));
    } else if (selected.has(hit.key)) selected.delete(hit.key);
    else selected.add(hit.key);
    paint();
  }

  let marquee = null;
  function startMarquee(e) {
    const base = new Set(e.shiftKey || MOD(e) ? selected : []);
    const x0 = e.clientX, y0 = e.clientY;
    const box = Object.assign(document.createElement('div'), { className: 'dk-marquee' });
    let moved = false;
    const move = (ev) => {
      const x1 = ev.clientX, y1 = ev.clientY;
      if (!moved && Math.hypot(x1 - x0, y1 - y0) < 4) return;
      if (!moved) { moved = true; document.body.append(box); }
      const r = { left: Math.min(x0, x1), top: Math.min(y0, y1), right: Math.max(x0, x1), bottom: Math.max(y0, y1) };
      Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px` });
      selected.clear();
      base.forEach((k) => selected.add(k));
      for (const { key, node } of rows()) {
        if (!node) continue;
        const n = node.getBoundingClientRect();
        if (n.right >= r.left && n.left <= r.right && n.bottom >= r.top && n.top <= r.bottom) selected.add(key);
      }
      paint();
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      box.remove();
      marquee = null;
      if (!moved) { selected.clear(); base.forEach((k) => selected.add(k)); paint(); }
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    marquee = { up };
  }

  // Capture phase so these gestures never reach DialKit's own scrub / drag / edit / collapse handlers.
  dockRoot.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !meta) return;
    const row = e.target.closest('.dialkit-timeline-row');
    if (!row || row.classList.contains('dialkit-timeline-ruler-row')) return;
    const bar = e.target.closest('.dk-group-bar');
    if (bar) {
      e.preventDefault();
      e.stopPropagation();
      startGroupDrag(e, bar);
      return;
    }
    const clipNode = e.target.closest('.dialkit-timeline-clip');
    if (clipNode && !MOD(e) && clipNode.hasAttribute('data-selected') && document.querySelector('.dialkit-timeline-popover')) {
      reclick = { x: e.clientX, y: e.clientY }; // let DialKit handle it (a drag still works), close after
    }
    // Pressing a clip outside the current selection drops that selection (as in Figma), so moving or
    // stretching it only ever touches that clip. Pressing a selected clip moves the whole selection.
    if (clipNode && !MOD(e) && !e.shiftKey && selected.size) {
      const hit = rows().find((r) => r.node === clipNode);
      if (hit && !selected.has(hit.key)) { selected.clear(); paint(); snapshot(); }
    }
    if (MOD(e)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.target.closest('.dialkit-timeline-lane') && !e.target.closest('.dialkit-timeline-clip')) startMarquee(e);
      else toggleRow(row);
      return;
    }
    // Plain drag on empty lane space → marquee (scrub from the ruler instead).
    if (e.target.closest('.dialkit-timeline-lane') && !e.target.closest('.dialkit-timeline-clip')) {
      e.preventDefault();
      e.stopPropagation();
      startMarquee(e);
    }
  }, true);
  dockRoot.addEventListener('click', (e) => {
    if (MOD(e) && e.target.closest('.dialkit-timeline-row')) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  addEventListener('keydown', (e) => {
    if (e.target.closest?.(`${TYPING}, .dialkit-timeline-popover`)) return;
    if (e.key === 'Escape' && selected.size) { selected.clear(); paint(); return; }
    if (MOD(e) && (e.code === 'KeyG' || e.key.toLowerCase() === 'g')) { // ⌘G group, ⇧⌘G ungroup
      e.preventDefault();
      if (e.shiftKey) api.ungroup();
      else api.group();
    }
  }, true);

  // ── keep the dock's scroll position across DialKit's re-renders ─────────────
  let savedScroll = 0;
  const scroller = () => dockRoot.querySelector('.dialkit-timeline-dock');
  dockRoot.addEventListener('scroll', (e) => { if (e.target === scroller()) savedScroll = e.target.scrollTop; }, true);
  new MutationObserver(() => {
    const s = scroller();
    if (s && s.scrollTop !== savedScroll) s.scrollTop = savedScroll;
    paint();
  }).observe(dockRoot, { childList: true, subtree: true });

  function bind() {
    unsubscribe?.();
    meta = TimelineStore.getTimeline(managed.id) ?? null;
    unsubscribe = meta ? DialStore.subscribe(meta.id, onValues) : null;
    snapshot();
    paint();
  }
  managed.onMount(() => {
    // Keep the selection across a regroup by mapping it through original keys.
    const keep = [...selected].map((p) => managed.originalKey(p));
    marquee?.up();
    bind();
    selected.clear();
    for (const k of keep) {
      const path = meta?.clips.find((c) => managed.originalKey(c.key) === k)?.key;
      if (path) selected.add(path);
    }
    paint();
  });
  bind();

  const api = {
    get selection() { return [...selected]; },
    clear() { selected.clear(); paint(); },
    group() {
      const original = [...selected].map((p) => managed.originalKey(p));
      if (managed.group([...selected])) {
        selected.clear();
        meta?.clips.filter((c) => original.includes(managed.originalKey(c.key))).forEach((c) => selected.add(c.key));
        paint();
      }
    },
    ungroup() { managed.ungroup([...selected]); },
  };
  return api;
}
