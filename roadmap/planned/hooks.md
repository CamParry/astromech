# Hooks

Hooks are how a plugin changes or extends what a write does. Today only entries
and globals fire them, and the two follow different rules. Every resource gets
the same events, fired at the same point in the handler, with the same payload
keys. From research on 2026-10-01 against the source of Payload v3, WordPress,
Strapi v5, Directus, Keystone 6, Craft 5 and Medusa v2.

## The contract

- **Names:** `<resource>:<before|after><Operation>`, as today. Per-operation
  names beat Payload's merged `beforeChange` (create and update payloads differ)
  and Directus's one name for both a filter and an action.
- **A before-hook is a filter.** It runs after load-and-check and before
  prepare, outside any transaction. It may change `data` in place or return a
  payload whose `data` replaces it; either way the result is parsed again with
  `parseHookOutput`, one item at a time. It vetoes by throwing an error core
  exports (`ApiError`, `PermissionDeniedError`, `ResourceValidationError`).
- **An after-hook is an action.** It runs after commit, and its return is
  ignored. A throw is logged naming the plugin and event, admins are notified
  (`notification-events.md`, "Plugin hook error → admins"), the remaining
  handlers and batch items still run, and the call succeeds, since the write
  committed. This reverses "One hook runner, and a throw always propagates" in
  `DECISIONS.md`.
- **Payload keys, for every resource:** the address (`type` for entries, `key`
  for globals), `operation` (the service method key, e.g. `publish`,
  `mergeStaged`), `locale` (resolved), `original` (the stored row when the
  operation began; null on create and on a new locale), `data` (the parsed
  input, never a password), and in after-hooks the resource as it now stands
  under its own key (`entry`, `global`, `user`, `media`). Delete and restore
  carry no `data`; entry delete carries `permanent`. `user` is dropped:
  handlers read `ctx.user`. `original` beat `previous`, `current` and `before`.
- **A new locale is an update** with `original: null`, for every resource
  (`DECISIONS.md` already models a translation as an update with a locale).
- **Batches:** one hook call per item, each with its own copy of `data`.
- **Staged changes fire their own events**, not the canonical ones:
  `before|afterCreateStaged`, `before|afterUpdateStaged` (an update with
  `staged: true`) and `before|afterDeleteStaged`, for entries and globals.
  Merging fires the canonical update hooks with `operation: 'mergeStaged'`.
- **Recursion:** `runHook` tracks nested depth in `AsyncLocalStorage` and throws
  `HookRecursionError`, naming the chain, past 8. It beat Payload's `context`
  flags (manual, and "context" is reserved here) and Directus's
  `emitEvents: false` (an option on every method).
- **Who fires them:** every service method call, including cron and the CLI.
  Raw repository maintenance (migrations, backup restore) fires none.
- **Typing:** a plugin types its own events by declaration merging, as
  `AstromechPluginServices` does; `hookEvents` and its `unknown` codegen go.

Left out until a consumer needs one: read hooks, field-level hooks, priorities,
`beforeOperation`/`afterOperation`/`afterError` (the audit trail covers them),
auth events (Better Auth has its own), notification hooks, an outbox, and a
site-level `hooks: []` outside a plugin.

## Coverage

| Resource      | Events                                     | Fired by                                                                                                                                      |
| ------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| entry         | `before/afterCreate`                       | `create`, `duplicate` (first locale)                                                                                                          |
| entry         | `before/afterUpdate`                       | `update`, a new locale, `publish`, `unpublish`, `schedule`, the scheduler, `mergeStaged`, `restoreVersion`, `duplicate` (each further locale) |
| entry         | `before/afterDelete`                       | `trash` (`permanent: false`), `delete`, `emptyTrash` (per entry)                                                                              |
| entry         | `before/afterRestore`                      | `restore`                                                                                                                                     |
| entry, global | `before/after{Create,Update,Delete}Staged` | `createStaged`, `update` with `staged`, `deleteStaged`                                                                                        |
| global        | `before/afterUpdate`                       | `update` (first write and a new locale included), the status methods, the scheduler, `mergeStaged`, `restoreVersion`                          |
| user          | `before/after{Create,Update,Delete}`       | `create`, first-run setup (system context), `update`, `restoreVersion`, `delete`                                                              |
| media         | `before/after{Create,Update,Delete}`       | `upload`, `update`, `replace`, `restoreVersion`, `delete`                                                                                     |

Media before-hooks run before any storage I/O, and get the uploaded `file`
read-only, for veto checks; replacing the bytes is a separate design. Deleting
the stored files moves after the commit. Notifications fire none. A plugin that
owns a resource fires `<namespace>:before<Op>`/`after<Op>` with the same keys,
as forms does.

## Work

- [ ] **Runner and types.** Split the before and after handler types, add the
      recursion guard, export the API errors (plugin service methods need them
      too: `@astromech/redirects` answers `null` for an unknown id instead of a
      404), replace `hookEvents` with declaration merging (forms then drops the
      cast in its spam hook), and fix the stale comment in
      `packages/plugins/forms/src/hooks/events.ts`.
- [ ] **Entry contract.** The payload keys; `beforeCreate` before prepare and
      its output re-parsed; the returned `data` honoured everywhere;
      `afterUpdate` given the written row (it receives the row from before the
      write today); one `data` copy per batch item. Update the redirects plugin
      to read `original` and `entry`. Change step 4 of "Service method files" in
      the `code` skill: the before-hook always runs before prepare.
- [ ] **Entry coverage.** Staged writes fire the staged events, not the update
      ones (a staged slug edit probably records a live redirect today: test it
      first); add `mergeStaged`, `restoreVersion`, `restore`, `emptyTrash`, and
      update hooks for each further locale of `duplicate`. `mergeStaged` firing
      the update hooks is also what makes the redirects plugin record a merged
      slug change. That plugin also builds the new path from the requested
      `data.slug`, not the stored one `uniqueSlug` may have changed, because
      `entry:afterUpdate` gets the row as it was before the write.
- [ ] **Globals.** The same payload, the staged events, `mergeStaged` and
      `restoreVersion`.
- [ ] **Scheduler.** Publish through the update path (the item in
      `in-progress/module-cleanup.md`).
- [ ] **Users.** `create`, setup, `update`, `restoreVersion`, `delete`.
- [ ] **Media.** `upload`, `update`, `replace`, `restoreVersion`, `delete`, with
      the storage I/O moved around the hooks.
- [ ] **After-hook errors and docs.** The log-and-continue rule, a hooks
      reference page in `apps/docs/plugins/`, and the `DECISIONS.md` entries
      this changes (the propagate rule, the create re-parse, the stale `hooks`
      mention).
