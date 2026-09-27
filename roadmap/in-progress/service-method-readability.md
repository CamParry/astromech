# Service method readability

Found reading `packages/astromech/src/users/methods/create.ts` top to bottom
(2026-09-27). Each fix applies to every method and every shared helper with the
same shape, not only to `createUser`.

- [ ] **The role check is input validation.** `createUser` and `updateUser` call
      `getRole` only for its throw, and it reports the path `role` where the
      input schema reports `data.role`. Check the role in `createUserSchema` and
      `updateUserSchema` against the configured roles, and drop the two handler
      calls.
- [ ] **A handler reads its inputs at the top.** Take what the handler needs from
      `params` and `ctx` first (`const { config, user } = ctx`, the acting user's
      id, the default locale), rather than reaching into `ctx` partway through.
      Every method under `packages/astromech/src/*/methods/`.
- [ ] **`writeFields` becomes `prepareFields`.** It merges, validates, coerces and
      prunes the fields a write stores; it writes nothing. Take one object
      argument, with the three source shapes as its keys, and name the row
      before the write `existing`, carried only by the update operation.
- [ ] **The shared `content/` helpers take the resource by name.** A call passes
      `resource: 'user'` and the helper looks up what it needs, so
      `RESOURCE_SPECS` is internal to `content/`. Rename it: "resource spec" was
      never agreed vocabulary.

The `scan` argument is left as it is: `backlog.md` asks whether `unique` fields
stay at all.
