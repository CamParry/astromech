# Naming conventions

The `code` skill fixes `get*` as "returns the thing, throws when absent". Read
cold, a `get*` call used only for its throw looks like a read with an unused
result.

- [ ] Decide whether a lookup that throws is `get*` or `require*`. `require*` is
      reserved for middleware today (`requireAuth`), so a change needs a new
      home for that meaning too. Record the outcome in `DECISIONS.md`.
- [ ] Use `prepare*` for every function that turns caller input into what a
      write stores, after `prepareFields` (`in-progress/service-method-readability.md`).
- [ ] Audit the other verbs across `packages/` against the result, and rename
      what disagrees.
- [ ] Call a resource's category its type, not its kind, everywhere: the
      `kind` member of `RESOURCE_CONFIG` (`packages/astromech/src/content/resources.ts`),
      `TARGET_KINDS`, `TargetKind`, and the relationships index's `sourceKind`
      and `targetKind` columns. The index's `sourceType` column already holds
      the entry type or global key, so it needs a new name first: `sourceKey`,
      `sourceEntryType`, or one merged `sourceType` column (`'entry:post'`,
      `'global:site'`, `'user'`), after Strapi's `related_type`. The rename
      reaches the public `usedBy` output, and needs a migration plus a hand
      edit to the Cloudflare baseline.
