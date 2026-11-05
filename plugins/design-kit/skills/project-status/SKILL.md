---
name: project-status
description: Status round for the current project: what is in flight, what is done and should be closed, what is next. Use when the user says "/project-status", "status", "where are we", "what's open", "what should I close", or starts a day on a project. Works for code projects (PRs, worktrees) and design projects (Paper, Figma, no git).
---

# Project status

Goal: a one-screen answer, then the housekeeping. Keep this session short; it is a dashboard, not a workplace. If this session is past a couple of hundred messages, say so and suggest a fresh one.

## 1. Gather (cheap, parallel)
- Read the project CLAUDE.md: `## In flight`, `## Decisions`, `## Log`.
- Sessions in this project's sidebar group: `list_sessions` with the group name, `include_archived: false`. Note each one's PR number and state.
- If the project has a git remote: `gh pr list --author @me --state open --json number,title,headRefName,updatedAt,reviewDecision,mergeable` and `git fetch --quiet && git branch -r --no-merged origin/main | head -20`.
- Design project without git: list the Paper pages and Figma nodes named in CLAUDE.md; do not open them unless asked.

## 2. Report (one screen)
A table, one row per piece of work, columns: what, where (PR / page / branch), state, blocked on. Then three lines: do next, waiting on others, stale.

## 3. Housekeeping (ask, then do)
Offer each as one line with a yes/no; do only what the user approves:
- Sessions whose PR is merged or closed: archive them.
- Sessions in "No folder" that belong to this project: say which, and that `/project-start` moves them.
- Open PRs with no session and no CLAUDE.md line, or CLAUDE.md lines with no PR: fix the `## In flight` section so it matches reality.
- PRs untouched for more than a week: ask whether to close or keep.
- Worktrees with no session and no open PR: offer to clean them up.

## 4. Update CLAUDE.md
Rewrite `## In flight` to match the table (one line per open piece: purpose, PR or page, status). Add a dated line to `## Log` only if something changed.

## Rules
- Never merge, close or push anything from here. Housekeeping is sessions, worktrees and CLAUDE.md.
- No forks and no subagents: everything here is a handful of commands.
- Prefer `gh` and `list_sessions` over asking the user what the state is.
