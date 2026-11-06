# claude-design-kit

Claude Code skills for design work that keep token use down. Built from three days of one designer's usage logs, where 84% of the cost was Claude reading context and more than half of the total was re-reading it: connector tool lists, long sessions, screenshots.

The guide that goes with it, for you and for your Claude: [GUIDE.md](GUIDE.md) (living copy: [Claude Code without burning tokens](https://claude.ai/artifact/KEqWdXX5fs6t4eDTTrx2rd)). Paste it into a Claude Code session and your Claude does the setup.

## Install

Inside Claude Code:

```
/plugin marketplace add seb-astian-wieser/claude-design-kit
/plugin install design-kit@seb-design-kit
```

Updates arrive with `/plugin marketplace update seb-design-kit`.

Then add this block to the end of your `~/.claude/CLAUDE.md`. It is what makes the skills fire without being asked, and it costs about 60 tokens a turn:

```markdown
## Project hygiene (token cost)
- In a "No folder" session, if the work belongs to a named project (client, product, site), say so in the first reply and offer `/project-start`.
- When I switch to a different section or exploration, or a milestone lands (direction picked, decision grilled, PR opened), run `/handoff` instead of continuing here.
- Read the project's CLAUDE.md pointers before asking for links or screenshots.
```

If you build prototypes, add this too:

```markdown
## Prototypes: always DialKit
- Every web prototype, demo page or animation gets DialKit for its controls: variant switches and tunable values (timings, sizes, colours, spacing, springs). Never build a hand-rolled toggle bar instead.
- Set it up with the `dialkit` skill before writing any controls.

## Building from my frames
- When prototyping from my Paper or Figma frames, reproduce exactly the copy and elements in my latest version. Never re-add text or UI I removed and never invent copy; anything not in my frames needs my OK first.
```

## Skills

| Skill | Triggers on | What it does |
| --- | --- | --- |
| `project-start` | "new project", a client or product with no folder yet, project work in a No-folder session | Creates `~/Projects/<name>`, writes a CLAUDE.md from a template, moves files in, moves the session there, names the connectors to keep on |
| `handoff` | "new section", "let's move on to X", a milestone landing | Appends a dated entry to the CLAUDE.md log and proposes a fresh session for the next piece, then stops |
| `project-status` | "status", "where are we", "what should I close" | One table of what is in flight from CLAUDE.md, the sidebar group and `gh pr list`; offers to archive finished sessions and fix the In-flight section |
| `prototype` | "prototype", "demo page", "build the animation", turning frames into something that runs | DialKit first with the patched panel, copy-for-copy from the frames, Vite + React in a section subfolder, then build and verify |
| `dialkit` | "add DialKit", "set up dials", any live control panel | Installs Sebastian's DialKit: [dialkit](https://github.com/joshpuckett/dialkit) pinned to 2.1.0 with the patched panel below, in every framework; stock and vanilla panels are never used |
| `grill` | "grill me", "interview me about this plan" | A one-question-at-a-time interview that pins down every real decision in a plan before anything is built |
| `react-run` | "add run", "set up the run utility" | The tiny `run()` utility for inline logic in JSX instead of nested ternaries, with Biome lint rules |

## The DialKit patch

`plugins/design-kit/skills/dialkit/extras/dialkit-patch/` is a dev-only Vite plugin that changes DialKit's panel without touching `node_modules`:

- one toolbar for the whole panel: sections menu, undo, redo, copy all parameters
- sections lose their own copy and save rows
- the open panel can be dragged by its title row
- easing durations up to 10 s
- version history of every panel's values in `dial-history.json`
- values auto-save to `dial-values.json` (`dial-values.plugin.js`), written atomically
- ⌘. hides and shows the panel

It edits the compiled React bundle with exact string replacements written against dialkit 2.1.0. Each must match once, so a DialKit update makes the dev server fail loudly instead of silently dropping the patch. React + Vite only; in a vanilla page mount the panel as a small React island.

`extras/sync-from-blick.sh` pulls newer patch files from the author's reference project when it exists on the machine and does nothing otherwise, so you can delete it or point it at your own reference project.

## Why it saves tokens

- A session re-sends everything on every turn. One section per session and a handoff note keep that small.
- A CLAUDE.md under 40 lines, read every turn, replaces pasted links, colours and screenshots.
- A live control panel turns twenty "a bit slower" turns into one pasted set of values.
- Connectors you are not using still ship their tool lists. Keep two or three on.
