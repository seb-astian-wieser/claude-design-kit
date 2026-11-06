---
name: handoff
description: Close the current section or exploration of a project and start the next one in a fresh session, so context does not pile up. Use when the user says "new section", "next exploration", "let's move on to X", "/handoff", or right after a milestone lands in a long session (a direction picked, a decision grilled, a PR opened) and the next piece is different work.
---

# Handoff

Why: by a few hundred messages, every turn re-reads the whole session. A fresh session that reads CLAUDE.md starts from a few thousand tokens instead of a few hundred thousand.

1. **Append to CLAUDE.md.** Under `## Log`, one dated entry of at most 8 lines: what landed, what was decided and why, what is open, which files or ids matter. New ids go under `## Pointers`, decisions under `## Decisions`. If the project has no CLAUDE.md, run `/project-start` first.
2. **Save memory** only for facts that other projects need (a tool preference, a workflow the user confirmed). Project facts belong in CLAUDE.md, not memory.
3. **Start the next section fresh.** Propose it with `start_session` (own_initiative, context "fresh", same folder, a brief of under 10 lines that says to read CLAUDE.md first and what done looks like). If the next section is not known yet, just tell the user the log is written and to open a new session in the folder when ready.
4. **Stop here.** Do not begin the next section in this session.
