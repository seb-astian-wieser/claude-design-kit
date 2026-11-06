---
name: project-start
description: Give a new project its own folder under ~/Projects with a CLAUDE.md, so every session on it shares pointers, decisions, memory and files. Use when the user says "new project", "/project-start", names a client, product or site that has no folder yet, or starts project work in a "No folder" session.
---

# Project start

Goal: one folder per project, one CLAUDE.md under 40 lines that a fresh session reads instead of asking the user for links, colours or screenshots.

1. **Name it.** kebab-case under `~/Projects/<name>` (client or product name, then the part: `gofundme-discovery`, `blink-site`). If a folder for this project already exists, skip to step 5.
2. **Create it.** `mkdir`, `git init`, `.gitignore` with `node_modules/` and `.DS_Store`.
3. **Write CLAUDE.md** from the template below. Fill it from what the user said in this session, from memory notes, and from files in the session folder. Leave a section empty rather than guessing.
4. **Move files worth keeping** from the session folder (renders, refs, prototypes, notes), excluding `node_modules` and `.claude`. Put each section's files in its own subfolder.
5. **Move the session there** with `change_directory`, then `propose_branch` before the first edit if the user has not named one.
6. **Say which connectors this project needs** (usually one or two) and that the rest can stay off. Do not toggle them yourself.

## CLAUDE.md template

```
# <Project name>

<One line: who the user is on this, what the deliverable is.>

## Pointers
- Figma / Paper / repo / staging / reference links with ids
- Brand: colours, fonts

## Folders
- `<section>/` what lives there

## Decisions
- <date> <decision in one line, with the why if it was argued>

## Working rules
- Connectors this project needs: <list>. Keep the others off.
- One session per section. End a section with `/handoff`.
- Prototypes get DialKit; tune in the browser, report final values once.

## Log
- <date> <what landed, what is open>
```
