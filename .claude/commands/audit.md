---
description: Review work for best practices, security flaws, code smells, and bad patterns. Read-only — reports findings, doesn't change code.
argument-hint: <what to review — "uncommitted", a branch name, a commit range, or a description>
---

You are auditing: **$ARGUMENTS**

This is a **read-only** review. Report findings — do not edit code. If I want fixes after, I'll ask (or hand the findings to `/refactor`). This is distinct from `/review` (standards + spec) and `/code-review` (correctness bugs); here the lens is **best practices, security flaws, code smells, and bad patterns**.

## 1. Resolve the target

Work out exactly what to review from the argument, then state the scope before diving in:

- **Uncommitted work** → `git status` + `git diff` (and untracked files).
- **A branch** → diff against the merge-base with `main` (`git diff main...<branch>`), so you review that branch's changes, not unrelated drift.
- **A commit / range** → that range's diff.
- **A described area** ("the rich-text stuff from a while back") → locate the relevant files and review them as they stand.

If the target is ambiguous, ask before proceeding. Read the actual code around the changes, not just the diff hunks — context matters for security and smell judgements.

## 2. Review across these lenses

Delegate to `reviewer` sub-agent(s) (read-only). For a larger surface, fan out — one agent per lens — and collect findings.

- **Best practices** — the `code` / `ui` / `api` / `css` skill rules; current TypeScript and CMS conventions; `import type`, no `any`, named exports, union types over enums, `!== undefined` over truthiness. Idiomatic over clever.
- **Security** — for this CMS especially: content **visibility** leaks (public vs full shape — does a public read expose private data? do mutations correctly require `full`?); rich-text/HTML **sanitization** (XSS via the allow-list in `support/rich-text-extensions.ts` + `visibility.ts`); auth/authz gaps (better-auth, role/permission checks); injection (raw SQL vs Drizzle params); secrets in code or logs; SSRF/path traversal in storage/media/drivers; unsafe `dangerouslySetInnerHTML`.
- **Code smells** — duplication, long functions, shallow modules with leaky interfaces, dead code, unclear naming, misplaced responsibility relative to the one-way layer model.
- **Bad patterns** — module-level singletons that should use the `globalThis.__astromech*` pattern, reserved instance keys misused, locale display-vs-content confusion, side-effect imports, anything that passes tsc/build but breaks at runtime.

Check names against `TERMINOLOGY.md` and structure against `ARCHITECTURE.md`. Verify claims against the current code — don't assert from memory.

## 3. Report

- Group findings by **severity** (critical / high / medium / low), security issues first.
- Each finding: `file:line`, what's wrong, why it matters, and a concrete suggested fix — concise.
- Call out false-alarm-prone things you checked and cleared, so I know the surface was covered.
- End with the top few things worth acting on. Offer to hand them to `/refactor` if I want them fixed.
