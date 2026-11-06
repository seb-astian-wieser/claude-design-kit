---
name: dialkit
description: Install DialKit (Josh Puckett's live-tuning control panel) in the current project and wire up controls so values can be tuned live in the browser. Use when the user says "add DialKit", "/dialkit", "set up dials", "I want to tune this live", "add sliders to tweak this", or asks for a live control panel for animation timings, colours, spacing or springs in any web project (React, Next.js, Vue, Svelte, Solid or plain JS). Also use when building an animation with a DialKit timeline / scrubber dock — it bundles timeline extras (multi-select, marquee, groups, linked drags, Space play/pause).
---

# DialKit setup

DialKit is a floating panel of sliders, colour pickers, toggles, springs and action buttons bound to values in your code. It installs per project; there is no global install.

## Steps

0. **Sync the patch from Blick**: run `extras/sync-from-blick.sh` (next to this file). Blick (`learn-about-art`) is the reference project; the script copies any newer patch or plugin files into `extras/` and prints the DialKit version Blick pins. Install that same version in step 3, since the patch is written against it.
1. **The version is pinned.** The patched panel is written against dialkit 2.1.0 (the version `extras/sync-from-blick.sh` prints). Install exactly that version and do not consult the upstream README to pick a newer one; the API below is from 2.1.0. Only when the user asks to move to a newer DialKit: update the replacements in `extras/dialkit-patch/plugin.js` first, then bump.
2. **Detect the app.** Which framework (package.json deps, config files), which package manager (lockfile: package-lock → npm, pnpm-lock → pnpm, yarn.lock → yarn, bun.lock(b) → bun). In a monorepo or a folder with several apps, pick the one the user means, or ask if it's unclear.
3. **Install** with that package manager, pinned: `dialkit@2.1.0` (exact, no caret) plus `motion`. Whatever the app's framework, the panel is always the patched React panel; the rows below say what else to install:

   | Framework | Packages | Import from | Styles |
   |---|---|---|---|
   | React 18+ / Next.js | `dialkit motion` | `dialkit` | `import 'dialkit/styles.css'` |
   | Solid, Svelte, Vue, vanilla JS, Astro, GSAP sites | `dialkit motion react react-dom` (dev) | the React island below | `import 'dialkit/styles.css'` inside the island |

   Outside React, mount the panel as a small React island (`createElement`, no JSX needed) and read values through the controller; the reference is `design/video/preview/` in Blick (`~/learning-art/learn-about-art`). Never use `dialkit/vanilla`, `dialkit/solid`, `dialkit/svelte` or `dialkit/vue` for the panel: those are the stock panels, and the patch does not reach them. The patch serves `dialkit` unbundled, so a project without the React plugin needs `optimizeDeps.include: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'motion/react']` in its Vite config.

   The other framework peer deps are optional, so nothing else gets pulled in.
4. **Mount exactly one root** for the app: `<DialRoot />` next to the app's UI (React/Solid/Svelte/Vue; in Next.js App Router put it in a `'use client'` component in the root layout), or the React island from the Blick reference outside React (never `createDialRoot()` from `dialkit/vanilla`). **Always** wire the ⌘. hide/show shortcut from "Hide the panel with ⌘." below.
5. **Keep it out of production.** Framework roots hide in production unless `productionEnabled` is set. **Vanilla roots show in production by default**, so load the vanilla panel dev-only behind a dynamic import, which also keeps it out of the bundle:
   ```js
   if (import.meta.env.DEV) import('./dials.js').then(({ attachDials }) => attachDials({ /* app hooks */ }));
   ```
6. **Add a small set of useful controls** to an existing component: the values someone would actually tune (timings, easing/springs, colours, radius, spacing, stroke weight), plus a Replay action for animations and a "Copy values" action that logs and copies the tuned values as source code to paste back. Wire them to real values in the component, not to a demo box. For vanilla, put the panel in its own `dials.js` with a small API from the host (remount, replay), rather than spreading DialKit calls through the app.
7. **Save the user's values**: set up the disk auto-save from "Never lose the user's tuned values" below in every project, and save the live values before any edit that reloads the page.
8. **Verify**: run the project's build and confirm it passes (for vanilla, grep the build output to confirm DialKit isn't in it). Then start the dev server, open it in the browser preview, check there are no console errors, move a slider or two and confirm the page responds. Report what each control does.

## Hide the panel with ⌘. (always, every project)

the user hides the whole DialKit panel with **⌘.** (Ctrl+. on Windows/Linux) and shows it again with the same keys. Add this in every setup, remembered across reloads in `localStorage` (`dialkit-hidden`). Hide the *root*, not a panel: values keep living in the store and the panels come back unchanged.

React / Next.js (Solid, Vue and Svelte work the same way: render the root conditionally):

```tsx
const [dialsHidden, setDialsHidden] = useState(() => {
  try { return localStorage.getItem('dialkit-hidden') === '1' } catch { return false }
})
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '.') {
      e.preventDefault()
      setDialsHidden((h) => {
        try { localStorage.setItem('dialkit-hidden', h ? '0' : '1') } catch {}
        return !h
      })
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [])
// …
{!dialsHidden && <DialRoot />}
```

Vanilla (in `dials.js`): destroy and recreate the root; kits created with `createDialKit` stay registered and reappear.

```js
const rootOptions = { position: 'top-right', theme: 'dark' };
let root = localStorage.getItem('dialkit-hidden') === '1' ? null : createDialRoot(rootOptions);
window.addEventListener('keydown', (e) => {
  if (!((e.metaKey || e.ctrlKey) && e.key === '.')) return;
  e.preventDefault();
  if (root) { root.destroy(); root = null; } else { root = createDialRoot(rootOptions); }
  try { localStorage.setItem('dialkit-hidden', root ? '0' : '1'); } catch {}
});
```

Mention the shortcut when reporting the setup. Reference: `learning-art/learn-about-art` (`src/App.tsx`, Oct 2026).

## API cheat sheet

```js
// Vanilla
import { createDialKit, createDialRoot } from 'dialkit/vanilla';
createDialRoot({ position: 'top-right', theme: 'dark' }); // position: top-left|top-right|bottom-left|bottom-right; theme: system|light|dark; mode: popover|inline
const kit = createDialKit('Card', config, { onAction: (path) => {} });
kit.subscribe((values) => { /* runs immediately, then on every change */ });
kit.values; kit.setValues({ folder: { key: 1 } }); kit.setValue('folder.key', 1); kit.resetValues(); kit.destroy();

// React / Vue
const values = useDialKit('Card', config, options); // Vue: values.radius in templates, values.value.radius in script
// Solid / Svelte
const values = createDialKit('Card', config, options); // Solid: values().radius
```

Config value → control:
- `[default, min, max, step?]` → slider; a plain number → slider with an inferred range
- `true/false` → toggle; a colour string (hex, rgb, hsl, oklch, P3) → colour picker; another string → text field
- `{ type: 'select', options: [...] }`, `{ type: 'image', options: [...] }`, `{ type: 'pad' }` → `{x, y}`
- `{ type: 'spring', visualDuration, bounce }`, `{ type: 'easing', duration, ease: [...] }` → transition config
- `{ type: 'action', label? }` → button, calls `onAction(path)`
- a nested object → folder (`_collapsed: true` starts it closed)

Panel options: `id` (share values across mounts), `persist` (localStorage, off by default; keep it off unless asked so the code stays the source of truth), `defaultCollapsed`, `onAction`, `shortcuts` (e.g. `{ radius: { key: 'r', mode: 'fine' } }`). Controllers for setting values from code: `useDialKitController` (React/Vue), `createDialKitController` (Solid/Svelte); in vanilla, `createDialKit` already returns one.

## Never lose the user's tuned values (always, every project)

the user tunes values in the panel while you keep editing code. Any edit to a file the page imports, a `navigate`/reload, or a dev-server restart reloads the page, and DialKit falls back to the code defaults. That silently throws away his tuning. So, in every DialKit setup:

1. **Auto-save to disk.** Copy `extras/dial-values.plugin.js` (next to this file) into the project root and `extras/dial-autosave.js` into `src/`. Register the plugin in the Vite config (`plugins: [dialValues()]`; it's dev-only, `apply: 'serve'`), then call `autosave(kit, '<Panel name>')` right after the kit is created and subscribed. Every change is written to `dial-values.json` about 300 ms later and restored on the next load. The file is never imported, so saving doesn't trigger HMR. Action buttons are stripped. If the endpoint doesn't answer, it never overwrites the file with defaults. For non-Vite stacks (Next.js etc.), add an equivalent dev-only route that reads and merges the same JSON shape (`{ savedAt, panels: { [name]: values } }`).
2. **Before any edit or reload, save first.** Read the live values (`window.__dial['<Panel name>']()` via the browser tool, or `dial-values.json`) and confirm they're on disk *before* touching files the page imports, navigating, or restarting the server. If the project has no auto-save yet, add it first, or bake the live values into the code defaults before editing.
3. **Bake on request or at the end of a tuning round.** When the user is happy (or asks), write the saved values into the code defaults (the `defaults`/config object), so the code stays the source of truth and a fresh clone looks the same. For timelines: express the dock edits as panel parameters where they fit (add a parameter when one is missing, e.g. a delay/offset), bake user groups via `createManagedTimeline(…, { groups })`, check every clip's at/duration matches the saved state exactly, then rewrite `dial-values.json` to the baked panel values with empty timeline `values` (back the file up first).
4. Don't use DialKit's `persist` (localStorage) for this. It's per-browser and invisible to you; the JSON file is readable, diffable and survives across browsers and sessions.

If values were already lost to a reload, say so plainly. Don't claim they were kept.

When you test by dragging/clicking in the page yourself, your test edits auto-save over the user's values: copy `dial-values.json` to the scratchpad first, run the test, then copy it back and reload.

Reference: the Blink flywheel prototype (`blink-flywheel`, Oct 2026).

## The patched panel (always, every project)

This is the only panel the user uses; a stock DialKit panel, in any framework, counts as outdated. `extras/dialkit-patch/` (next to this file) changes the stock panel without touching `node_modules`:

- **One toolbar under the DialKit title**, right-aligned: copy (all sections at once) | undo, redo (also ⌘Z, ⇧⌘Z / ⌘Y; one slider drag is one step), version history | sections menu (jumps to a section, ticks the one you're in). Sections lose their own Copy parameters / Save version row and the divider under it. Action buttons get white text. The open panel can be dragged by its title row (stock DialKit only drags it while collapsed). Easing durations go up to 10 s (stock: 2 s).
- **Version history** (clock button): a dropdown of saved versions grouped by day, each listing its changes ("Motion · Open · Duration 1 → 1.05") and who made it (You, Reload, Claude, Restored). Opening one previews its values read-only (live in the app) with Restore and Done. Versions are saved 30 s after the last panel change, on reload with unsaved changes, on load when the values changed in code, and on restore. Stored in `dial-history.json` (30 days) through a dev-only endpoint.

Setup: copy the folder into the project root as `dialkit-patch/`, add `dialkitPatch()` (from `./dialkit-patch/plugin.js`) to the Vite `plugins`, and add `dial-history.json` and `dial-history.json.tmp` to `.gitignore`. It's dev-only (`apply: 'serve'`); production builds use the stock package (or the project's defaults-only stub).

- The patch edits DialKit's compiled React bundle with exact string replacements written against **dialkit 2.1.0**. Each must match once, so after a DialKit update the dev server fails loudly instead of dropping the patch: update the replacements in `plugin.js` (or pin 2.1.0).
- The patch rewrites the React bundle only, which is why every stack mounts the React island. Non-Vite stacks (Next.js) need the same replacements applied another way (a loader); say so and ask before building.
- When you change `toolbar.js` or `toolbar.css`, the module URL changes (a hash), so a normal reload picks it up.
- Testing it yourself saves versions and values: back up `dial-values.json` and `dial-history.json` first and put them back after.
- Reference: Blick (`learn-about-art`, Oct 2026), where it was built.

## Timelines: always add the user's timeline extras

Whenever a project uses a DialKit **timeline** (`createDialTimeline` / `createDialTimelineRoot`, or the user asks for a timeline/scrubber/choreography), copy `extras/dialkit-timeline-extras.js` (next to this file) into the project's `src/` and wire it up. It adds what the stock dock lacks:

- **Multi-select:** ⌘/Ctrl-click clips; ⌘-click a group row selects the whole group; **drag on empty lane space draws a marquee** (Shift/⌘-drag adds); a plain click on empty space clears; Esc clears. Scrubbing moves to the ruler.
- **Linked edits:** dragging or stretching any selected clip moves/stretches the rest of the selection by the same delta. Pressing a clip outside the selection drops the selection first (as in Figma), so a lone drag only ever touches that clip.
- **Groups:** ⌘G turns the selection into a real dock group ("Group A"), ⇧⌘G ungroups (hint shown next to the group name). Moving or stretching a clip *inside* a group changes only that clip and the group bar adapts; the whole group moves with its bar. Values edited in the dock carry over through group/ungroup.
- **Group bars (Jitter-style):** every group row (config groups and ⌘G groups) shows one summary bar from its first start to its last end, still visible when the group is collapsed. Drag it to move the whole group; drag its left/right edge to stretch or squash the group's timing proportionally (starts and durations scale around the opposite edge); click it to select the group (Shift/⌘ toggles). Snaps to 0.01 s like DialKit's own drags.
- **Editor toggle:** clicking the clip whose properties popover is open closes it (stock DialKit reopens it); dragging that clip still works.
- **Space:** play / pause (from the end it starts over); double-tap restarts from 0.
- **Fixes for dialkit 2.0.2:** plain from/to clips become one-step sequences (the clip editor otherwise shows "From" twice); the dock keeps its scroll position across re-renders (otherwise it snaps to the top and the edited clip lands at the bottom edge).

Wiring (vanilla, tested on dialkit 2.0.2):

```js
import * as dialkit from 'dialkit/vanilla';            // pass DialKit's own exports: each entry bundles its own stores
import { createManagedTimeline, enhanceDock, bindSpaceKey, persistTimeline } from './dialkit-timeline-extras.js';
import { autosave } from './dial-autosave.js';

const dockRoot = dialkit.createDialTimelineRoot({ theme: 'dark', defaultOpen: true });
const tl = createManagedTimeline(dialkit, 'Hero', config, { groups: DEFAULT_GROUPS });   // plain from/to clips are fine; `groups` = baked-in default groups (tl.reset() returns to them)
tl.onFrame((v) => render((key) => tl.clip(key, v)));          // read clips by ORIGINAL key ("open.trade") — paths change when grouped
const dock = enhanceDock(dialkit, dockRoot.element, tl);      // dock.group(), dock.ungroup(), dock.selection, dock.clear()
bindSpaceKey(tl);                                             // optional { before } hook, e.g. to cancel a "play to here" stop
// New choreography from panel controls → tl.setConfig(nextConfig)  (fresh values, user groups kept)
// Panel buttons can call dock.group() / dock.ungroup() / tl.reset(); include tl.groups and live clip timings in "Copy values".

// Saving (same dial-values.json as the panel, see "Never lose the user's tuned values"):
const timelineSave = persistTimeline(tl, 'Hero timeline');   // every dock edit + groups, keyed by original clip keys
autosave(kit, 'Hero').then(() => setTimeout(() => timelineSave.restore(), 250));
// ↑ restore the dock AFTER the panel: a restored panel value can remount the timeline (debounced onSettings),
//   which would wipe a dock restore done earlier. Nothing is written until restore() reached the endpoint.
```

Saving gotcha: a panel change that alters the generated config remounts the timeline with fresh values, so dock edits reset (and that reset is saved). Tell the user, or fold the dock edits he cares about into panel controls.

Other frameworks: the dock DOM is the same, but `createManagedTimeline` needs vanilla's `createDialTimeline`. In React/Vue/Solid/Svelte projects, either drive the timeline from a vanilla island or port `createManagedTimeline` to the framework's timeline hook — say so rather than claiming it works untested. Reference build: the Blink mobile-menu prototype (`blink-menu-motion`, Oct 2026).

## Gotchas

- Slider drags fire every frame. If a change triggers something expensive (rebuilding a GSAP timeline, re-rendering a scene), debounce it (~150 ms).
- If the host rebuilds its DOM (theme switch, remount), reapply DialKit values afterwards, or inline styles set during the rebuild will overwrite them.
- Timeline `updateConfig()` keeps the values already in the dock (they're user-editable), so new from/to values from panel controls don't apply. Remount instead (`tl.setConfig` in the extras does this).
- Plain numbers in timeline clip `from`/`to` become sliders with an **inferred step** (48 snaps to 50, 668 to 670). Give animated values explicit `[value, min, max, step]`.
- Vanilla `createDialRoot` sits top-right and the timeline dock spans the bottom: lay the demo out to clear both (measure the dock element, it's ~400px tall).
- Reference setup: `~/depetrini-logo-reveal/src/dials.js` (vanilla + GSAP: colours, line weight, beat times that rebuild the timeline at the playhead, Replay, Copy beat times).
