---
name: grill
description: Use this skill whenever the user asks Claude to plan something significant (a feature, a project structure, an architecture, a big refactor) and wants to be "grilled" or interviewed about the plan before anything gets built. Trigger on phrases like "grill me", "interview me about this plan", or any request to nail down a plan together before implementation starts.
---

# Grill

A relentless one-question-at-a-time interview to pin down every real decision in a plan before building anything.

## How to run it

1. Look over the plan/request first. Anything answerable by reading the codebase (existing patterns, config, file structure, conventions), go look it up yourself. Don't ask the user things the code can tell you.
2. For everything else, the actual decisions, walk the design tree one branch at a time. Find the dependencies between decisions and resolve them in a sensible order (don't ask about something downstream of an unresolved upstream choice).
3. Ask ONE question at a time. Never bundle multiple questions in one message.
4. For each question, give your recommended answer and a short reason, then wait for the user's response before moving to the next question.
5. After the user answers, if it changes downstream branches, adjust your remaining questions accordingly.
6. Keep going until every meaningful decision in the plan is resolved.
7. Do NOT start implementing anything until the user explicitly confirms you've both reached shared understanding of the full plan.

## Style
Keep it low-key and short, per the user's usual preference, one crisp question + one recommendation each turn, not an essay.
