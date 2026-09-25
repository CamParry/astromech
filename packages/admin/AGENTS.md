# packages/admin

The published `@astromech/admin`: the admin SPA, the component kit behind core's `astromech/ui` subpaths, and the Vite helper core's Astro integration merges. Admin UI work follows the `ui` skill.

- **Imports inside the admin are relative**, and it reaches core only through `astromech/shared`, `astromech/fetch` and type-only imports from `astromech` (`ARCHITECTURE.md`, "The browser boundary"). The `@/*` entry in `tsconfig.json` points at core's `src` only so the core source those entries reach can be type-checked.
- **Code only the admin uses lives here**, not in core's leaves. A browser-safe value the admin needs from core goes in `packages/astromech/src/exports/shared.ts`.
- **It ships as source.** The site's Vite compiles it after core's integration registers `virtual:astromech/admin-config` and `virtual:astromech/plugins/components`, and `src/vite.ts` registers `virtual:astromech/admin-icons`; `src/virtual-modules.d.ts` types all three. tsup builds only what plain Node loads: `src/vite.ts` and the four `astromech/ui` entries in `src/exports/`.
- **A new browser dependency** goes in the admin's `dependencies` and, as a bare specifier, in the `dependencies` list in `src/vite.ts`; core's integration renders it into the site's `optimizeDeps.include`. `tests/vite.test.ts` fails when `src` imports a package the list misses.
- **`routeTree.gen.ts` is generated and gitignored.** `pnpm -F @astromech/admin routes:generate` writes it; `typecheck` runs that first.
- **Tests live in `tests/`, mirroring `src/`**, and run with `pnpm -F @astromech/admin test:run`. They import the admin as `@/admin/...` and core as `@/...`. The module-isolation rule is core's (`packages/astromech/AGENTS.md`), with this package's own `tests/_support/isolated-tests.ts`.
- **The admin calls the server through `astromechUntypedClient`** from `astromech/fetch`, never `astromechClient`: it addresses entry types and globals by runtime strings, which the typed facades cannot narrow.
- **A test mocks the client as `astromech/fetch`**, the specifier admin source imports.
- **Query keys come from `hooks/use-query-keys.ts`, and writes from a resource module's `xMutations()` table** (`hooks/entries.ts`, `globals.ts`, `media.ts`, `users.ts`, `notifications.ts`), run with `useAdminMutation`. A new write is a row in its table naming the keys it invalidates.
- **A page takes an entry type or global id** and reads it through `useAdminEntryType` or `useAdminGlobal`; the route files only map params. The edit pages compose `useEditController` with `<FieldsForm>` (`components/forms/fields-form.tsx`) and the pieces in `components/entries/entry-form-fields.tsx` and `staging-controls.tsx`, and the entries list composes `useListController`.
