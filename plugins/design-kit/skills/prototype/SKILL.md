---
name: prototype
description: Build a web prototype, demo page or animation the way the user wants every time - his latest DialKit (the Blick patch) for all controls, built copy-for-copy from his frames. Use whenever the user says "prototype", "proto", "demo page", "make it interactive", "build the animation", or asks to turn Paper or Figma frames into something that runs in the browser.
---

# Prototype

Every prototype gets the same three things. Do them in this order and do not skip one because the prototype is small.

## 1. DialKit first, the user's version
Invoke the `dialkit` skill before writing a single control. Its step 0 syncs the patch from Blick, so what gets installed is always the user's latest panel (toolbar under the title, copy all, undo/redo, version history, draggable panel, auto-save to `dial-values.json`, ⌘. to hide). Never build a toggle bar, segmented buttons or a settings drawer by hand; every variant switch and every tunable value (timings, springs, sizes, colours, spacing, scroll positions) is a DialKit control.

## 2. Copy-for-copy from the user's frames
If the prototype comes from his Paper or Figma frames, list the text and elements in his latest version before building, and reproduce exactly those. Never re-add something he removed, never invent copy or sections. Anything not in his frames needs his OK first. If there are no frames, say what you are assuming and keep placeholder text to a minimum.

## 3. Stack and location
- Default stack: Vite + React + TypeScript, `motion` for animation, the `run()` utility set up with the `react-run` skill. Plain Vite without React only if the user asks for vanilla; the panel patch is React-only, so vanilla gets the panel as a small React island.
- Put it in the project folder under a section subfolder (`tunnel/prototype/`, `hero/prototype/`), not in a session folder. If there is no project folder, run `/project-start` first.
- Keep assets local to the prototype folder; copy renders and photos in rather than linking to session folders.
- Add `dial-values.json` to git, `dial-history.json` and `.tmp` to `.gitignore`.

## 4. Finish
- Run the build, start the dev server in the browser pane, check the console is clean, move a control and confirm the page responds.
- Report the controls in one short list, the ⌘. shortcut, and the URL.
- Tuning loops: tell the user to tune in the browser and paste the values from "Copy all" once, instead of iterating by chat.
- When the direction is picked, run `/handoff` so the values and decision land in CLAUDE.md.
