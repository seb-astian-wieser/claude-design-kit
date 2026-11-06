---
name: react-run
description: Set up and enforce the tiny `run()` utility in a React/TypeScript project — `run(() => { if (…) return …; return …; })` for inline logic in JSX instead of nested ternaries or IIFEs — with three Biome GritQL lint rules. Use when the user says "add run", "/react-run", "set up the run utility", "enforce run()", or when starting or working in a React/TSX project that doesn't have `run` and its Biome rules yet.
---

# run() utility + Biome rules

Pattern from https://www.edoardolunardi.dev/blog/writing-cleaner-react-with-a-tiny-utility (after Max Greenwald's "Do More With Run"):

```ts
export const run = <T,>(fn: () => T): T => fn();
```

- **Use it** for inline logic inside JSX (one condition per line with early returns, and TypeScript narrows per branch), for scoped async work in server components (`await run(async () => { … })`), and anywhere you'd otherwise write an IIFE.
- **Don't use it** when you're already in a function body (write the ifs directly) or for trivial cases (`run(() => x)` is just `x`). Keep each block short; extract a function when it grows.

## The rules (files next to this SKILL.md)

| File | Flags | Severity |
|---|---|---|
| `biome-plugins/run-no-nested-ternary-jsx.grit` | A ternary with another ternary in a branch, inside a JSX child `{…}` or attribute value | error |
| `biome-plugins/run-no-iife.grit` | `(() => …)()`, `(async () => …)()`, `(function () {…})()`, `(async function () {…})()` | error |
| `biome-plugins/run-misuse.grit` | `return run(…)` / `return await run(…)` (already in a function body) and trivial `run(() => expr)` without a block | warn |

Nested ternaries outside JSX are left alone (Biome's own `style/noNestedTernary` covers those if wanted). `test/cases.tsx` has 8 bad and 5 good examples; all 8 bad ones fire and no good ones. Parenthesised nested ternaries count too.

## Steps

1. **Check the project.** React + TS/JS (package.json, tsconfig). Find the package manager from the lockfile (package-lock → npm, pnpm-lock → pnpm, yarn.lock → yarn, bun.lock(b) → bun) and the utils folder the project already uses (`src/lib`, `src/utils`, `lib`, `app/lib`…).
2. **Add the utility.** Copy `run.ts` from this skill into that folder (default `src/lib/run.ts`). If the project already has an equivalent helper, keep theirs and point the rules' messages at it.
3. **Biome.**
   - Has Biome (`biome.json`/`biome.jsonc`): needs v2+ for plugins. Check `npx biome --version`; if it's 1.x, say so and ask before upgrading (`npx @biomejs/biome migrate`).
   - No Biome: install it pinned (`npm i -D -E @biomejs/biome`, or the project's package manager) and create `biome.json` with `npx biome init`. If the project already lints and formats with ESLint/Prettier, don't remove them: tell the user Biome will run next to them for these rules, and offer to turn Biome's formatter off (`"formatter": { "enabled": false }`) so the two don't fight.
4. **Copy the rules** into `biome-plugins/` at the project root and register them in biome.json:
   ```json
   "plugins": [
     "./biome-plugins/run-no-nested-ternary-jsx.grit",
     "./biome-plugins/run-no-iife.grit",
     "./biome-plugins/run-misuse.grit"
   ]
   ```
   Add a `lint` script if there's none (`"lint": "biome lint ."`).
5. **Run it**: `npx biome lint --only=plugin .` and report what fires. Don't rewrite existing code unless the user asks; when they do, convert each finding to `run()` by hand (the rules have no auto-fix because a fix would also need the import).
6. **Write new code to the rules** from then on.

## Notes on the GritQL

- Biome 2.x loads `.grit` files via `plugins`; diagnostics come from `register_diagnostic(span, message, severity)`. Docs: https://biomejs.dev/linter/plugins/
- Node names like `JsxExpressionChild()`, `JsxExpressionAttributeValue()`, `JsFunctionBody()` are Biome CST names; check with the Biome playground if a newer version renames them.
- Suppress a single finding with `// biome-ignore lint/plugin: <reason>`.
