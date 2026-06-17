---
description: Plan or research a direction before building — prior art, terminology, structure, and best practices. Output is a plan, not code.
argument-hint: <what you want to plan / the problem or question>
---

You are planning: **$ARGUMENTS**

This command is for thinking, not building. The output is a clear direction and (where warranted) a written plan — **no implementation**. When the plan is settled, it hands off to `/feature` or `/refactor`. Use this to open a session and drive focus.

Per CLAUDE.md, this is a conversation first: for architecture decisions, talk it through back-and-forth before producing any plan or option menu — don't assume and proceed. Don't rush to a document.

## 1. Frame the problem

- What are we actually deciding or solving? State it plainly. Surface the real constraints (Cloudflare Workers / D1 / R2, SSR-only, the one-way layer model in `ARCHITECTURE.md`).
- Read the relevant code, `roadmap/`, `ARCHITECTURE.md`, and `TERMINOLOGY.md`. Recall any relevant project memory.
- If the goal is ambiguous, ask me before going further.

## 2. Research & prior art

- Investigate how established systems solve this — Payload, Strapi, Sanity, Directus, Keystone, AdonisJS, etc. — and pull only what fits Astromech's context (lightweight, type-first, edge-runtime). Don't cargo-cult; note _why_ a borrowed idea fits or doesn't.
- For library/framework/API specifics, use **context7** (current docs) over memory. For broader investigation, web search; for a deep multi-source pass, the `deep-research` skill.
- Bring back the trade-offs, not just one answer.

## 3. Terminology, structure & best practices

This is a first-class part of planning, not polish:

- **Vocabulary:** name things precisely and consistently. Check new terms against `TERMINOLOGY.md`; reconcile clashes and note any term worth adding there. Ambiguous or overloaded names are a design smell — resolve them now, before they're baked into code. (The `ubiquitous-language` skill can help extract/harden terms.)
- **Organisation & structure:** where does this live in the layer model? Prefer deep modules with simple interfaces over shallow ones; respect the one-way dependency stack. (The `improve-codebase-architecture` skill can surface structural opportunities.)
- **Best practices:** apply current TypeScript and CMS conventions and the `code` skill's rules. Favour the simple, idiomatic shape over the clever one.

## 4. Produce the plan

- Once the direction feels settled, write it down — a working **spec in `specs/`** for a non-trivial design (ephemeral scratch: deleted once shipped, never linked from durable docs), or a concise plan in chat for something smaller.
- Decide where it lands on the `roadmap/` (new file in `planned/`, or an update to an existing one) and whether the follow-through is a `/feature` or a `/refactor`.
- Want to pressure-test it before committing? Use `grill-me` (or `grill-with-docs`) to stress the plan against the domain model.
- End with: the chosen direction, the key trade-offs behind it, and the concrete next step.
