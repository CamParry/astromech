---
milestone: 1.0
---

# Audit trail

A record of which service method ran, with which arguments, for which user, with
what outcome. Split out of `roadmap/completed/ai-integration.md` on 2026-08-06,
where it was P10 and where P9 deferred it; it is core work across every
transport, not assistant work, so it outlived the feature that raised it.

The assistant is the forcing function, not the scope. The CLI, the MCP server and
the admin's own routes raise the same question, and answering it inside the chat
drawer leaves every other caller silent.

## What exists already

`@astromech/assistant`'s approval rows survive their decision, so an approved or
rejected **write in the drawer** is on record with who, when and what method
(`DECISIONS.md`). Nothing else is: a read, an
ungated call, and every transport other than the drawer are all silent.

That row also sets the precedent for what a record keeps. It drops the arguments
when it resolves and holds method, target, decision, who and when.

## The work

Decided 2026-10-02: `DECISIONS.md`, "The audit trail records that a write ran,
not what it wrote".

- [x] **Decide what a row holds.** Method id, resource type, target ids, user id
      (no foreign key), the user's email, origin, outcome, time, and the
      history record the write took (`roadmap/planned/history.md`). No payloads.
- [x] **Decide whether core's log absorbs the approval rows or references them.**
      References: the approval row points to the core row of the call it
      allowed.
- [x] **Decide where the model-call logs land.** Not here: they are cost and
      timing, and belong with `request-performance-monitoring.md`.
- [ ] **Log from `defineService`'s `bind`** (`packages/astromech/src/services/define-service.ts`),
      the one path every trusted and scoped call takes. Only `mutates: true`
      methods, and only the outermost call. The origin needs carrying from each
      transport on the context.
- [ ] **The core table**, with a migration and a hand edit to the Cloudflare
      baseline. Decide retention when it is built (Strapi defaults to 90 days).
- [ ] **Security events** (`roadmap/in-progress/core-security.md`). Each has one
      call site, and none logs until this table exists:
      a failed sign-in in the `hooks.after` branch of
      `packages/astromech/src/auth/better-auth.ts`, and the lock refusal in its
      `hooks.before`; an account lock where `lock()` answers true in
      `packages/astromech/src/security/sign-in-failures.ts`; an automatic block
      at the upsert in the same file; a manual block, unblock, allow or remove
      through `defineService`'s `bind` (they are `mutates: true`); a captcha
      failure in the `requireCaptcha` middleware and in the forms plugin's spam
      hook.
- [ ] **The assistant's approval row** gains a reference to the core row.
- [ ] **A read path** for the admin, which resolves the user's name at render
      time and falls back to the stored email.

## Boundaries

**Not versions.** `@astromech/backups` already keeps versions of an entry. A
version answers what the row used to look like; this answers who changed it and
through what.

**Its page is core.** The activity log is a core admin page over this data,
as in Directus, not a plugin (decided 2026-10-03,
`roadmap/proposed/additional-first-party-plugins.md`). Nothing else records.
