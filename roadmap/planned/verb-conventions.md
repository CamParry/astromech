# Verb conventions

The `code` skill fixes `get*` as "returns the thing, throws when absent". Read
cold, a `get*` call used only for its throw (`getRole(config, slug)` in
`packages/astromech/src/users/methods/create.ts`) looks like a read with an
unused result.

- [ ] Decide whether a lookup that throws is `get*` or `require*`. `require*` is
      reserved for middleware today (`requireAuth`), so a change needs a new
      home for that meaning too. Record the outcome in `DECISIONS.md`.
- [ ] Use `prepare*` for every function that turns caller input into what a
      write stores, after `prepareFields` (`in-progress/service-method-readability.md`).
- [ ] Audit the other verbs across `packages/` against the result, and rename
      what disagrees.
