---
milestone: 1.0
---

# Naming conventions

> **Follows `roadmap/planned/drafts.md`** (decided 2026-10-03): staged changes become drafts in their own table, so revise the staging parts of this file before building it.

The `code` skill fixes `get*` as "returns the thing, throws when absent". Read
cold, a `get*` call used only for its throw looks like a read with an unused
result. Paths below are under `packages/astromech/src/` unless they say
otherwise.

- [x] Decide whether a lookup that throws is `get*` or `require*`. Decided
      2026-10-02: `get*` stays, and a guard is an `assert*` returning `void`
      (`DECISIONS.md`, "A lookup's result is used; a guard is an `assert*`").
- [ ] Write the local lint rule (`DECISIONS.md`, "A discarded return value is a
      lint error"), turn on `@typescript-eslint/no-meaningless-void-operator`,
      and fix what it finds: 62 call statements in core's sources on
      2026-10-02, about 28 of them repository writes.
    - [ ] Replace the guard calls with `assert*` functions: `getEntryResource`
          in `entries/methods/used-by.ts` and
          `entries/methods/preview/revoke-token.ts`; `requireStagedChange` in
          both `staging/delete.ts`; and the empty-patch `prepareEntryFields` and
          `prepareGlobalFields` calls in `entries/internal/update-batch.ts` and
          `globals/internal/update-global.ts`.
    - [ ] `assertNoPluginCollisions` returns the plugin identities. Split the
          check from the read.
    - [ ] Repository writes whose rows nobody reads (`update`, `deleteMany`,
          `create`): `void` the call, or stop returning the rows.
    - [ ] Every `ctx.runHook` call drops the payload a handler returns. That is
          `planned/hooks.md` ("the returned `data` honoured everywhere"); `void`
          them with a note pointing there if the rule lands first.
- [ ] Rename `requireStagedChange` to `getStagedChange` where its result is
      used, `getDatabaseDriverOrThrow` to `getDatabaseDriver`, and the internal
      `get*` functions that return `undefined` to `resolve*`: `getFieldType`,
      `getModel`, `getRequestScope`, `getTransactionScope`, `getClientAddress`,
      `getMethodManifest` and the admin's `getFieldComponent`.
- [ ] Use `prepare*` for every function that turns caller input into what a
      write stores, after `prepareFields` (`completed/service-method-readability.md`).
- [ ] Audit the other verbs across `packages/` against the result, and rename
      what disagrees.
- [ ] Call a resource's category its type, not its kind, everywhere
      (`DECISIONS.md`, "A resource's category is its type"). In one commit,
      since the first rename frees the name the second takes: the index's
      `sourceType` column (the entry type or global key) becomes
      `sourceSubtype`, then `sourceKind` and `targetKind` become `sourceType`
      and `targetType`. Also `TARGET_KINDS`/`TargetKind` to
      `TARGET_TYPES`/`TargetType`, the `kind` member of `RESOURCE_CONFIG`
      (`content/resources.ts`) to `type`, and the `kind` parameters that carry
      a resource type (`content/usage.ts`, `content/staging.ts`). The rename
      reaches the public `usedBy` output, needs a migration plus a hand edit to
      the Cloudflare baseline, and adds "subtype" to `TERMINOLOGY.md`'s
      "Resource type" entry.
