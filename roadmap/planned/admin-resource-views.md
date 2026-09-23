# Admin resource views

Admin pages compose shared controller hooks and panels, after react-admin's
`useEditController` and Payload's one edit view for collections and globals,
and read query keys and mutations from one factory per resource.

## Why

- The entry and global edit pages copy their staging controls, status panel
  wiring and versions link.
- `hooks/entries.ts` has 15 `useMutation` bodies, each repeating the same
  invalidation and toasts; globals, media, users and notifications repeat the
  shape. Six plugin route files mirror the core ones, each building a binding.
- `scopedEntryKeys`/`scopedGlobalKeys` repeat the key factory under a
  `cacheScope` prefix, although plugin type ids are already qualified.
- Seven query keys are written inline despite the factory's header: five in
  the admin (`session`, `setup-check`, the command palette's search and the
  dashboard's two) and two in plugin pages. The dashboard's counts
  (`pages/_protected/index.tsx`) are keyed outside `entries.all(type)`, which
  every entry mutation invalidates, so with the 30-second `staleTime` it shows
  old numbers.
- The entry create page writes without invalidating the entries list.
- The pages are large: `entries-list-page.tsx` 1159 lines,
  `entry-edit-page.tsx` 795, `entry-new-page.tsx` 569, `global-edit-page.tsx`
  491, `user-edit-page.tsx` 485.

Checked against the code on 2026-09-23: the `globals` case in
`utilities/ai-context.ts` (core) already exists with no `default`, and the
type-aware `switch-exhaustiveness-check` lint rule already fails on a missing
case. The scheduled-publish date bug was fixed by `3f040f10`; both edit pages
seed the input through `formatDatetimeForInput`.

## The plan

- **Keys.** `hooks/use-query-keys.ts` is the one factory. Entry keys take the
  type id and global keys the global id, bare or plugin-qualified, so
  `scopedEntryKeys`, `scopedGlobalKeys` and `cacheScope` go. The dashboard
  reads through `useEntriesQuery`, so its counts and recent entries sit under
  `entries.list(type, …)`. `auth.session`, `auth.setupCheck` and `search` move
  in. The two plugin keys stay in the plugins, under `['plugin', name]`: a
  plugin imports `astromech/ui`, not the admin's factory.
- **Mutations.** Each resource module (`hooks/entries.ts`, `globals.ts`,
  `media.ts`, `users.ts`, `notifications.ts`) exports one
  `xMutations(address)` factory of TanStack `mutationOptions`, whose `meta`
  names the keys it invalidates and its toasts. `useAdminMutation` runs any
  of them: it invalidates `meta.invalidates` and toasts.
  Bulk restore sends one `restore` with every id. A staged change that already
  exists resolves the create as `null`, so both callers open it without an
  `onConflict` branch.
- **`useAdminEntryType(type)` and `useAdminGlobal(id)`** (`hooks/`) read
  `AdminConfig.entryTypes`/`globals`, the i18n namespace, the base path and
  `can(action)` from `entryPermission`/`globalPermission`. The pages take a
  type or global id; the route files pass their params, and the plugin
  routes qualify theirs.
- **`useEditController({ resource, id, locale, staged })`** loads the
  canonical row or its staged change, builds the form values and the one
  `update` payload (status only on a canonical write), and exposes staging
  create, merge and discard with their confirms. `StagingControls`,
  `StagingBanner`, `VersionsLink` and the form fields (`TitleField`,
  `SlugField`, `StatusField` over `PublishPanel`, `FieldColumn`) are shared by
  the entry and global edit pages and the create page.
- **`useListController`** for the entries list: typed URL search (no cast),
  query params, pagination and sort. Users and media keep their own: each is
  one typed route whose `Route.useNavigate` needs no cast, and media's
  `useMediaBrowser` already serves the library and the picker.

## The work

- [x] Add the `globals` case to `utilities/ai-context.ts` with no `default`.
      Already true; lint covers exhaustiveness.
- [x] One key factory keyed by the entry type id; delete `scopedEntryKeys`,
      `scopedGlobalKeys` and `cacheScope`; move the inline keys in, with the
      dashboard's counts under `entries.all(type)` so mutations invalidate
      them. The two plugin page keys stay, under `['plugin', name]`.
- [x] Per-resource `mutationOptions` naming the keys each one invalidates;
      `hooks/entries.ts`'s bodies become one table; bulk restore sends one
      request.
- [x] `useAdminEntryType(typeId)` replaces `EntriesBinding` and
      `GlobalsBinding` (with `useAdminGlobal(id)`); the core and plugin route
      files only map params, and an unknown id renders `NotFoundPage`.
- [x] `useEditController(resource, target)`: loading canonical or staged, one
      form codec, one `update` carrying status, staging create, merge and
      discard. Shared `StagingControls` and `PublishPanel`. The resource is
      `entryEditResource` or `globalEditResource`; the staged entry view shows
      Discard as a button, as the global one did, instead of a menu item.
- [x] `useListController` for the entries list; users and media adopt it where
      the shape matches. Neither does: each is one typed route whose
      `Route.useNavigate` needs no cast, and `useMediaBrowser` already serves
      the media library and the picker.
- [x] The five large pages become compositions of the above:
      `entries-list-page.tsx` 441 lines, `entry-edit-page.tsx` 375,
      `entry-new-page.tsx` 237, `global-edit-page.tsx` 178,
      `user-edit-page.tsx` 372 (it keeps its own profile panel: name, email
      and role are account fields, not the entry form's).
- [x] `entries-list-page.tsx`'s `patchSearch` casts its `navigate` argument
      `as unknown as`; the list controller's search update is typed instead
      (`navigate({ to: '.', search })` with the merged search object).
- [x] Guard: the recommended rules of `@tanstack/eslint-plugin-query`, and a
      drift-report pattern for a literal `queryKey` array outside
      `hooks/use-query-keys.ts`. The rules passed after one fix (the command
      palette's key missed its entry types); the existing drift pattern now
      also reports a key array held in a variable, as the backups page does.

Depends on `resource-module-shape.md` (`globals.update` with status),
`one-service-handle.md` and `plugin-types-in-core-registries.md`.
