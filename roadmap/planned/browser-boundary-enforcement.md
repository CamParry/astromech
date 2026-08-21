# Browser boundary enforcement

The rule that keeps server code out of the admin bundle is written in filenames
and enforced by nothing. `decisions/0084-the-browser-boundary-is-declared-not-marked.md`
holds the reasoning and the shape of the replacement; this file holds the
measurements and the work.

## What is actually true today

`ARCHITECTURE.md` describes `*.shared.ts` as marking a domain file the admin
bundle may hold, and says the suffix limits that file to importing the leaves,
`fields/`, and other `*.shared.ts` files. No tool checks either half. The rules
that did — `admin-only-client-and-pure-leaves` and
`shared-files-stay-browser-safe` — went with dependency-cruiser in
`decisions/0070-drop-dependency-cruiser.md`.

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
exists for five residual exceptions.

## Two files carry the marker and should not

- `packages/astromech/src/media/image-widths.shared.ts` has no importer in
  `admin/`. Its consumers are `packages/astromech/src/astromech.ts`,
  `packages/astromech/src/config/admin-config.ts`,
  `packages/astromech/src/exports/index.ts` and two `media/` files.
- `packages/astromech/src/transport/http/routes/http-routes.shared.ts` is read
  only by `packages/astromech/src/transport/http/client/index.ts`. That is the
  fetch client's boundary, not the admin's.

## The work

Ordered by what unblocks what. The first item is the one that matters; the rest
are cheap once it lands.

- [ ] **Narrow the `'@/'` alias**, or give the admin a specifier that goes
      through a declared entrypoint. Until this lands, an `exports` map binds
      nothing, because admin imports never reach it. The alias exists so plugin
      components share module identity with the admin, which
      `roadmap/planned/admin-as-its-own-package.md` records as surviving the
      split, so this is a question about _what_ the alias covers rather than
      whether it exists. Belongs with the admin split.
- [ ] **Add `exports/shared.ts` and a `"browser"` condition**, following Payload
      (`decisions/0084-the-browser-boundary-is-declared-not-marked.md` has the
      shape). One re-export file for the five domain leaves, one `exports` entry
      in `packages/astromech/package.json` and its `publishConfig`. Moves no
      source files.
- [ ] **Retire the `*.shared.ts` suffix** once the entrypoint exists and the
      admin reaches it. Seven files, plus `ARCHITECTURE.md`. Not before: a
      marker that enforces nothing is still better than no marker and no
      entrypoint.
- [ ] **Fix the two mislabelled files** above. Independent of everything else —
      whether the suffix survives or not, these two do not belong in the set.
- [ ] **Decide what checks the entrypoint's contents.** Directus issue 26613 is
      the case: a package boundary and subpath exports did not stop `node:assert`
      reaching the browser, because nothing checked what was added to `shared/`.
      Options are a test that imports the entrypoint under a browser condition,
      or accepting `check:boot` as the check and saying so.

## Not in scope

**An `@astromech/shared` package.** Rejected in
`decisions/0084-the-browser-boundary-is-declared-not-marked.md`: it reverses
`decisions/0074-leaves-are-placed-by-subject.md`, adds a third publishable unit,
and Directus 26613 is the evidence that it does not enforce itself.

**Moving the five domain leaves.** They stay with their subject. Only the
specifier the admin reaches them by is in question.
