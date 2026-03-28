# CLAUDE.md

Astromech is a lightweight TypeScript CMS. Built to work well across runtimes but designed for Astro + Cloudflare. Build on TanStack Router and Hono.

## Sub-agents

Use sub-agents wherever the task is clear enough to delegate. Always include a full implementation plan in the prompt — file paths, exact code changes, and expected outcomes — so the agent can execute without re-researching the codebase.

## Workflow

- **Clarify before acting:** If a task is ambiguous or the right approach depends on an unclear requirement, ask first — don't assume and proceed.
- **Reflect on focus shifts:** When the focus of work changes significantly, pause to consider: are there lessons learned that belong in a skill? Anything worth saving to memory? Does ROADMAP.md need updating?

## CSS Conventions

- All sizing values (widths, heights, padding, gap, margin, etc.) must be multiples of `0.25rem`. No arbitrary values like `2.2rem` or `7.1rem`.

## Communication

- Don't give time estimates for tasks
