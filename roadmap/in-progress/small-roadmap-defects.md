# Small roadmap defects

Three independent one-file fixes gathered from `backlog.md` and planned-file
side notes, batched onto one branch (`fix/small-roadmap-defects`) because each
is too small to carry a workstream alone. One commit per fix.

- [x] **Unknown sort keys are silently dropped.** `SORTABLE_FIELDS` in
      `packages/astromech/src/entries/storage/built-in.ts` is a six-name
      allow-list; anything else is dropped and falls back to `createdAt desc`.
      This is the sort equivalent of what
      `decisions/0029-an-unknown-where-key-throws.md` fixed for filters, and the
      fix follows the same shape: throw, naming the key and the remediation.
      Noted in `roadmap/planned/field-value-query-indexing.md` as worth closing
      regardless of when field-value indexing ships.
- [x] **`initRuntime` writes `process.env.ASTROMECH_API_ROUTE`.** The value is
      read back at request time inside `getAuth()`
      (`packages/astromech/src/users/auth.ts`); the read is fine, the write is
      the defect — on Workers `process.env` is a compatibility shim populated
      from bindings, not a plain mutable object, so the assignment is not
      guaranteed to do anything there. Replace the channel with a registry slot,
      or pass `apiRoute` into `getAuth()` from the caller. Deferred from
      `roadmap/completed/workers-cron-never-boots.md`.
- [ ] **`encodeWith` returns `Record<string, unknown>`.** It should return its
      table's insert shape so callers stop casting the rows they hand to
      `.values()` — `apps/demo/seed.ts` carries the cast today. A signature
      change on one function; moved here from
      `roadmap/planned/plugin-tables-on-the-site-handle.md`, where it was the
      independent third item.
