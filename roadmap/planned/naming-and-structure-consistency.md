# Naming and structure consistency

The content modules drifted apart as they were refactored one at a time. This
file brings them to one shape, using `users/` (the most recently refactored) as
the reference, and updates the `code` skill where the code has moved past it.
Public API renames land together, since nothing is published.

## Shared code into `content/`

- [ ] One locale resolver (`resolveUserLocale`, `resolveMediaLocale`, globals'
      `resolveLocale`), one uniqueness check (`userIsUnique`, `mediaIsUnique`),
      and shared `overlayLocale`/`buildOrderBy` (copied in `users/repository.ts`
      and `media/repository.ts`).
- [ ] One `assertCapability` (entries and globals each have one); move
      `CapabilityError` from `entries/errors.ts` to `errors/`.
- [ ] A versions-methods factory for the near-identical
      `media/methods/versions/*` and `users/methods/versions/*`, and one
      `ResourceNotFoundError(kind, …)` for their identical error files.

## Names

- [ ] The reverse lookup is `usedBy` everywhere: entries'
      `incomingRelationships`/`listIncomingRelationships`/`/incoming-relationships`
      and media's `listMediaUsage`/`/usage` become one key, one type (`Usage`)
      and one path (`/:id/used-by`).
- [ ] Table rows are `XTableRow`/`NewXTableRow` and joined repository rows are
      `XRow`: entries and globals reuse `EntryRow`/`GlobalRow` for both today.
- [ ] Repository factories are singular (`createGlobalRepository`,
      `createSettingRepository` if settings survives, `createEntryTableRepository`,
      `createTableRepository` for `tableRepository`); flatten
      `globals/repository/` to `globals/repository.ts`.
- [ ] Row-to-domain mappers are `toX`: `asEntry`, `asRecord`, `asGlobal` become
      `toEntry`, `toGlobal`; retire `EntryRecord`, since "record" is rejected
      for an entry.
- [ ] Lookup verbs follow the `code` skill: globals' `findGlobal` and
      `resolveGlobal` are swapped, `requireCanonical` and `requireRole` use
      `require*` outside middleware, and `getSession` returns null. Add a
      `find*` returns-null rule to the skill and apply it (`readUser`,
      `readMedia`).
- [ ] One name for "the resource row's plain repository" (users' `accounts`,
      media's `files`).
- [ ] Plugins: short service keys (`backups.list`, not `listRuns`), verb keys
      for seo (`getSitemap`), `seo:view` → `seo:read`, `buildXService` →
      `createXService`.
- [ ] REST: `DELETE /entries/:type/:id/force` contradicts "there is no
      force-delete"; `POST /media/upload` becomes `POST /media`.

## Data access and errors

- [ ] `auth/setup.ts` and parts of `entries/internal/relationships.ts` and
      `content/relationships.ts` query outside a repository; move them behind
      one.
- [ ] Users' delete transaction lives in the method, media's in the repository;
      pick one.
- [ ] The users and media list/count signatures differ; align them.

## Admin

- [ ] `astromechClient.entries as unknown as EntriesService` is repeated 12
      times; export the untyped services from `astromech/fetch` and delete the
      `api` member from the entry and global bindings.
- [ ] Staging controls are copy-pasted between `entry-edit-page.tsx` and
      `global-edit-page.tsx`; extract a hook and a component.
- [ ] `hooks/entries.ts` repeats one mutation body about 15 times; add a
      factory. Bulk restore fires one request per id although the service takes
      a list.
- [ ] Split `EntriesListPage` (about 730 lines) and `EntryEditPageBody` (about 640) into hooks and components once the pieces above exist.

## Leftovers

- [ ] Dead exports `EntryQueryResult` and `QueryOptions`; re-exports outside
      `exports/` in `entries/repository/types.ts`, `entries/repository/table.ts`,
      `transport/tools/dispatch.ts`, `plugins/define-service-method.ts` and
      `database/drivers/d1.ts`.
- [ ] Code comments that cite specs or phases that no longer exist
      (`spec §3.3`, `spec §8`, `spec §11`, `P2/P3`, "Phase 3").
- [ ] `ARCHITECTURE.md` names `entries/repository/versions.ts`, which does not
      exist; the `code` skill's repository-directory rule and its `ids` example
      no longer match the code.
