# Service method readability

Found reading `packages/astromech/src/users/methods/create.ts` top to bottom
(2026-09-27). Each fix applies to every method and every shared helper with the
same shape, not only to `createUser`.

- [x] **The role check is input validation.** `createUser` and `updateUser` call
      `getRole` only for its throw, and it reports the path `role` where the
      input schema reports `data.role`. Check the role in `createUserSchema` and
      `updateUserSchema` against the configured roles, and drop the two handler
      calls.
- [x] **A handler reads its inputs at the top.** Take what the handler needs from
      `params` and `ctx` first (`const { config, user } = ctx`, the acting user's
      id, the default locale), rather than reaching into `ctx` partway through.
      Every method under `packages/astromech/src/*/methods/`.
- [x] **`writeFields` becomes `prepareFields`.** It merges, validates, coerces and
      prunes the fields a write stores; it writes nothing. Take one object
      argument, with the three source shapes as its keys, and name the row
      before the write `existing`, carried only by the update operation.
- [x] **The shared `content/` helpers take the resource by name.** A call passes
      `resource: 'user'` and the helper looks up what it needs, so
      `RESOURCE_SPECS` is internal to `content/`.
- [x] **The per-resource table is `RESOURCE_CONFIG`, typed `ResourceConfig`.**
      "Resource spec" was never agreed vocabulary; `TERMINOLOGY.md` has
      "Resource type" and its config.
- [ ] **Move `RESOURCE_TYPES` beside `RESOURCE_CONFIG`.** Blocked: the list sits
      in `types/domain.ts` because `content/schema.ts` builds `usageSchema` from
      it, and `content/resources.ts` imports the resource schemas that import
      `content/schema.ts`, so the move leaves the list undefined at load time.

The `scan` argument is left as it is: `backlog.md` asks whether `unique` fields
stay at all.
