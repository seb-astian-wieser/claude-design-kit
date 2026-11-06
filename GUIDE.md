# Claude Code without burning tokens

Nov 6, 2026 · Sebastian Wieser. Living copy: https://claude.ai/artifact/KEqWdXX5fs6t4eDTTrx2rd

Paste this whole doc into a Claude Code session. Your Claude follows the setup steps in the last section, installs a small set of skills and three lines of rules, and from then on keeps your sessions short and your context small. The 60-second version and a short handbook are for you.

## For you: the 60-second version

- In one heavy week, 85% of what Claude Code cost was reading and 15% writing. More than half of the total was re-reading what it had already seen: the tool lists of your connectors, the whole conversation, every screenshot, on every turn.
- One folder per project with a short CLAUDE.md, and one session per section of work, cut that by half or more.
- Prototypes get a live control panel, so you tune in the browser and paste values once instead of twenty chat rounds.
- Keep two or three connectors on, not twelve.
- Three habits to learn: start a session in the project folder, say `/handoff` when you switch topics, say `/project-status` when you want an overview.

## Handbook

Why the setup above works, and the habits the skills encode. Nothing here is required reading.

### Why

In one heavy Claude Code week, 85% of the cost was Claude reading context and 15% writing. 57% of the total was re-reading context it had already seen, because every turn sends the system prompt, every connector's tool list and the whole conversation again. Cached reads are cheap per token, but a 500k-token session pays about 10 cents per turn before it writes a word.

| What | One designer's week, Nov 2026, at API rates |
| --- | --- |
| Baseline per request | 65k to 130k tokens |
| Context per turn, long sessions | 240k to 680k tokens on average |
| One turn at 500k context | about 10 cents to read, 1.5 cents to write |
| Most expensive session | 2,100 messages, 42 hours, $173 |
| Share of cost that was writing | about 15% |

- **Baseline per request** is the system prompt plus the tool list of every attached connector and plugin, sent before you have typed a word. "No folder" sessions sat at the top of the range, project sessions at the bottom.
- **Context per turn** is the whole conversation so far: your messages, Claude's replies, tool results, screenshots, all re-read on every turn. Measured across the five biggest sessions; the peaks were near the 1M window.
- **One turn at 500k** shows the split: cached reads are cheap per token but there are half a million of them, while the reply is a few hundred tokens.
- **The most expensive session** was a hub kept open for days that forked child sessions, each starting with the hub's whole history; $103 of the $173 was those forks.
- **15% writing** means the other 85% was reading context: 28% reading new material for the first time (tool results, files, your messages) and 57% re-reading what was already there.

### The habits

- **One folder per project, one CLAUDE.md under 40 lines**: pointers, decisions, in flight, log. Read every turn, it replaces pasted links and screenshots. A "No folder" session gets private memory and starts 30 to 50k tokens heavier.
- **One session per section.** Name the thing in the first message; `/handoff` at a topic switch or milestone. By a few hundred messages each turn costs five times what it did at the start.
- **Two or three connectors on.** Each one ships its tool list every turn; plugins with hundreds of tools go per project.
- **Tune in the browser, paste values once.** Twenty rounds of "a bit slower" at 500k context is pure re-reading.
- **Fewer screenshots.** Each one stays in context for the rest of the session; link the frame or the running app.
- **Narrow reads, short outputs, lower effort for polish**, and `/compact` after a milestone rather than when forced.
- **No long-lived hub that forks children.** Open sessions yourself with a ten-line brief; git, the sidebar group and an In-flight section in CLAUDE.md are the overview; `/project-status` once a week.
- **Model by cache price.** Sonnet reads cache at the same price as Opus; Haiku at a twentieth, so Haiku for renames, tests and scans.
- Claude cannot see its own context size, so when a session has clearly gone long, type `/handoff` yourself.

### The skills

Seven skills, installed by step 1 of the setup. Each is a folder with one `SKILL.md` and triggers on the phrases in its description; the exact files are in [the repo](https://github.com/seb-astian-wieser/claude-design-kit), and updates arrive with `/plugin marketplace update seb-design-kit`.

| Skill | Triggers on | What it does |
| --- | --- | --- |
| `project-start` | "new project", a client or product with no folder yet, project work in a No-folder session | Creates the folder, writes the CLAUDE.md from a template, moves files in, moves the session there, names the connectors to keep on |
| `handoff` | "new section", "let's move on to X", a milestone landing | Appends a dated entry to the CLAUDE.md log and proposes a fresh session for the next piece, then stops |
| `project-status` | "status", "where are we", "what should I close" | One table of what is in flight from CLAUDE.md, the sidebar group and `gh pr list`; offers to archive finished sessions and fix the In-flight section |
| `prototype` | "prototype", "demo page", "build the animation", turning frames into something that runs | DialKit first with the patched panel, copy-for-copy from the frames, Vite + React in a section subfolder, then build and verify |
| `dialkit` | "add DialKit", "set up dials", any live control panel | Installs DialKit, applies the patched panel (one toolbar, undo/redo, version history, auto-save to `dial-values.json`, ⌘. to hide), syncs the patch from the reference project first |
| `grill` | "grill me", "interview me about this plan" | Interviews you about a plan before anything is built, so the decision is made once and written down |

## For your Claude: setup steps (agents, start here)

When the user hands you this doc, do the following in order. Ask before each step that changes their settings, change nothing else, and install nothing beyond what is listed.

1. **Install the kit.** Run these two, or if you cannot run the CLI, tell the user to type them as slash commands inside Claude Code:

   ```
   claude plugin marketplace add seb-astian-wieser/claude-design-kit
   claude plugin install design-kit@seb-design-kit
   ```

   This adds seven skills: `project-start`, `handoff`, `project-status`, `prototype`, `dialkit` (with a patched panel), `grill`, `react-run`. Source and README: [github.com/seb-astian-wieser/claude-design-kit](https://github.com/seb-astian-wieser/claude-design-kit).
2. **Append this block to `~/.claude/CLAUDE.md`** (create the file if it is missing; leave everything already in it untouched):

   ```markdown
   ## Project hygiene (token cost)
   - In a "No folder" session, if the work belongs to a named project (client, product, site), say so in the first reply and offer `/project-start`.
   - When I switch to a different section or exploration, or a milestone lands (direction picked, decision grilled, PR opened), run `/handoff` instead of continuing here.
   - Read the project's CLAUDE.md pointers before asking for links or screenshots.
   ```

   If the user builds web prototypes, also append the two blocks under "Install" in the repo README (always DialKit, build from my frames).
3. **Review connectors.** List the MCP servers and connectors attached to this session with their tool counts. Recommend which two or three to keep on globally for this user's work and which to switch on per project. The user makes the change in the app's connector settings; do not toggle them yourself.
4. **Place the current work.** If this session has no project folder and the work belongs to a named project, offer `/project-start` now. If it is in a project folder with no CLAUDE.md, offer to write one with the `project-start` template.
5. **Report in five lines:** what was installed, what was appended, the connector recommendation, and the three habits from the section above. Then stop.
