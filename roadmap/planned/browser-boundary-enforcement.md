# Browser boundary enforcement

The rule that keeps server code out of the admin bundle is written in filenames
and enforced by nothing. `DECISIONS.md`
holds the reasoning and the shape of the replacement; this file holds the
measurements and the work.

## What is actually true today

The admin reaches core only through `astromech/shared`, `astromech/fetch` and
type-only imports from `astromech`, and a lint rule refuses any `@/` import from
`packages/admin/src/`. `packages/astromech/tests/exports/shared-browser.test.ts`
bundles the two entries for the browser and fails on a Node builtin or on a core
file outside its allowlist. No filename marker remains: the allowlist names each
browser-safe domain file by path, which is where a reader finds the set.

`packages/astromech/src/integrations/astro/vite.ts` aliases `'@/'` to the whole
of the package's `src/` inside the consuming project's Vite graph. So the admin
can reach any core module, including a domain service, and the only backstop is
`pnpm run check:boot` loading the admin in a headless browser.

Nothing currently walks through that door. Every runtime import `admin/` makes
outside itself lands in `fields/`, `utilities/`, `types/`, `errors/`,
`registry.ts`, `transport/http/client/`, or one of five domain leaves. This is
structural risk, not a live defect.

## The seam, by where browser-safety comes from

`admin/` reaches about twenty-five modules at runtime. Five carry the marker.

| Reached at runtime                                 | Marked |
| -------------------------------------------------- | ------ |
| `fields/` — seven modules, thirteen imports        | no     |
| `utilities/` — five modules, sixteen imports       | no     |
| `transport/http/client/index` — twenty-one imports | no     |
| `registry.ts`, `types/` — four imports             | no     |
| five domain leaves — eight imports                 | yes    |

The unmarked twenty are browser-safe because of the directory they live in, and
those directories are closed: `fields/` reaches only `types/`, `utilities/`,
`errors/` and itself; `utilities/` reaches only `types/`; `registry.ts` reaches
only `errors/`. So the boundary is already directory-shaped, and the suffix
existed for five residual exceptions.

## Two files thought to carry the marker wrongly

This section is wrong. Stage 1 of
`roadmap/in-progress/admin-as-its-own-package.md` found both files in the
browser bundle: `media/serving/image/url.ts`, which `astromech/shared`
re-exports, imports `image-widths.ts`, and the fetch client, which is
`astromech/fetch`, imports `http-routes.ts`. Both belonged in the set, and both
are on the bundle test's allowlist. The original claim follows.

- `packages/astromech/src/media/image-widths.ts` has no importer in
  `admin/`. Its consumers are `packages/astromech/src/astromech.ts`,
  `packages/astromech/src/config/admin-config.ts`,
  `packages/astromech/src/exports/index.ts` and two `media/` files.
- `packages/astromech/src/transport/http/routes/http-routes.ts` is read
  only by `packages/astromech/src/transport/http/client/index.ts`. That is the
  fetch client's boundary, not the admin's.

## The work

Ordered by what unblocks what. The first item is the one that matters; the rest
are cheap once it lands.

- [ ] **Narrow the `'@/'` alias**, or give the admin a specifier that goes
      through a declared entrypoint. Until this lands, an `exports` map binds
      nothing, because admin imports never reach it. The alias exists so plugin
      components share module identity with the admin, which
      `roadmap/in-progress/admin-as-its-own-package.md` records as surviving the
      split, so this is a question about _what_ the alias covers rather than
      whether it exists. Belongs with the admin split.
- [x] **Add `exports/shared.ts` and a `"browser"` condition**, following Payload
      (`DECISIONS.md` has the
      shape). One re-export file for the five domain leaves, one `exports` entry
      in `packages/astromech/package.json` and its `publishConfig`. Moves no
      source files. Stage 1 added `packages/astromech/src/exports/shared.ts` and
      its `exports` entries. It added no `browser` condition, which
      `DECISIONS.md` rejects: on `./shared` it changes nothing, and on `.` the
      Cloudflare server build may resolve it.
- [x] **Retire the `*.shared.ts` suffix** once the entrypoint exists and the
      admin reaches it. Stage 5 renamed the six files that carried it and
      listed them by path in the bundle test's allowlist.
- [x] **Settle the three stems in `entries/`**, handed on from
      `roadmap/completed/entries-naming-consistency.md`. Stage 5 kept
      `entry-url.ts` and `entry-types.ts`, which read better at the import site
      than `url.ts` would, and `validation-mode.ts` kept its name.
- [x] **Fix the two mislabelled files** above. Stage 1 showed they were not
      mislabelled: both are in the browser bundle (see the correction above).
- [x] **Decide what checks the entrypoint's contents.** Directus issue 26613 is
      the case: a package boundary and subpath exports did not stop `node:assert`
      reaching the browser, because nothing checked what was added to `shared/`.
      Options are a test that imports the entrypoint under a browser condition,
      or accepting `check:boot` as the check and saying so. Stage 1 chose the
      test: `packages/astromech/tests/exports/shared-browser.test.ts` bundles
      `astromech/shared` and `astromech/fetch` for the browser and fails on a
      Node builtin or an unlisted core file.

## Not in scope

**An `@astromech/shared` package.** Rejected in `DECISIONS.md`: it reverses the
rule that a pure leaf is placed by subject, adds a third publishable unit, and
Directus 26613 is the evidence that it does not enforce itself.

**Moving the five domain leaves.** They stay with their subject. Only the
specifier the admin reaches them by is in question.
