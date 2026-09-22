# Admin resource views

Admin pages compose shared controller hooks and panels, after react-admin's
`useEditController` and Payload's one edit view for collections and globals,
and read query keys and mutations from one factory per resource.

## Why

- The entry and global edit pages copy their staging controls, and copied the
  scheduled-publish date bug between them.
- `hooks/entries.ts` has 16 `useMutation` bodies. Six plugin route files
  mirror the core ones, each building a binding with a cast.
- `scopedEntryKeys`/`scopedGlobalKeys` repeat the key factory under a
  `cacheScope` prefix, although plugin type ids are already qualified.
- Seven query keys are written inline despite the factory's header. The
  dashboard's counts (`pages/_protected/index.tsx`) use two of them, which no
  entry mutation invalidates, so with the 30-second `staleTime` it shows old
  numbers.
- `utilities/ai-context.ts` ends in `default: break`, which hides its missing
  `globals` case.
- The pages are large: `entries-list-page.tsx` 1161 lines,
  `entry-edit-page.tsx` 785, `entry-new-page.tsx` 568, `global-edit-page.tsx`
  507, `user-edit-page.tsx` 485.

## The work

- [ ] Add the `globals` case to `utilities/ai-context.ts` with no `default`,
      and fix `apps/docs/ai-context.md`, which still lists `'settings'`.
- [ ] One key factory keyed by the entry type id; delete `scopedEntryKeys`,
      `scopedGlobalKeys` and `cacheScope`; move the inline keys in, with the
      dashboard's counts under `entries.all(type)` so mutations invalidate
      them.
- [ ] Per-resource `mutationOptions` naming the keys each one invalidates;
      `hooks/entries.ts`'s bodies become one table; bulk restore sends one
      request.
- [ ] `useAdminEntryType(typeId)` replaces `EntriesBinding` and
      `GlobalsBinding`; the core and plugin route files only map params.
- [ ] `useEditController(resource, target)`: loading canonical or staged, one
      form codec, one `update` carrying status, staging create, merge and
      discard. Shared `StagingControls` and `PublishPanel`.
- [ ] `useListController` for the entries list; users and media adopt it where
      the shape matches.
- [ ] The five large pages become compositions of the above.
- [ ] Guard: `@tanstack/eslint-plugin-query`; a `no-restricted-syntax` rule
      refusing a literal `queryKey` array outside `hooks/use-query-keys.ts`;
      the `ui` skill gains a rule that a page composes controllers, and logic
      a second page needs becomes a hook.

Depends on `resource-module-shape.md` (`globals.update` with status),
`one-service-handle.md` and `plugin-types-in-core-registries.md`.
