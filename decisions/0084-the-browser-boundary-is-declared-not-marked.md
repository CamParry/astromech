# 0084 — The browser boundary is declared, not marked

**Date:** 2026-08-22
**Status:** accepted

`0036` replaced a dependency-cruiser allowlist with a `*.shared.ts` filename
suffix, and paired it with a `shared-files-stay-browser-safe` rule to keep the
marker honest. `0070` superseded `0036` and removed dependency-cruiser, both
rules with it. The suffix stayed.

This record settles what the marker is worth now, and what replaces it. The work
is `roadmap/planned/browser-boundary-enforcement.md`.

## What the suffix turned out to be

Nothing checks it. There is no dependency-cruiser config, no `eslint.config.js`
rule, and no build step that reads `.shared`. The name asserts a property that
no tool verifies, and `check:boot`'s admin-paint assertion is the only thing
between a server import and a dead admin.

It also never covered the set it names. `admin/` makes runtime imports from
about twenty-five core modules; five carry the suffix. The rest reach `fields/`,
`utilities/`, `types/`, `errors/`, `registry.ts` and `transport/http/client/`,
and are browser-safe because of the directory they live in. So the property the
suffix encodes is not "the admin bundle may hold it" but "a _domain_ file the
admin bundle may hold" — twenty of the twenty-five qualify without it.

Two of the seven files carrying it do not satisfy even that narrower reading.
`media/image-widths.shared.ts` has no importer in `admin/` at all; its consumers
are `astromech.ts`, `config/admin-config.ts`, `exports/index.ts` and two `media/`
files. `transport/http/routes/http-routes.shared.ts` is read only by the fetch
client, which is a different boundary wearing the same badge.

And it describes the minority consumer. `entries/type-ids.shared.ts` has
twenty-one importers, four of them in `admin/`; the filename advertises the
browser to the seventeen server files that read it.

None of the seven is dishonest about its own imports — four import nothing at
runtime, one imports a sibling shared file, one imports `fields/flatten`, one is
type-only. There was no defect to fix. The marker was simply describing less
than it claimed and more than was true.

## The prior art `0036` cited does something else

`0036` named Payload as the precedent and read it correctly:
`packages/payload/package.json` exposes `"./shared"` pointing at
`src/exports/shared.ts`, and puts a `"browser"` condition on the root export
resolving to the same file. It also distinguishes `"./internal"` and `"./node"`.
That is still what Payload does.

`0036` declined it as needing "a second directory to keep in sync with the
first". Payload has no second directory: it has one re-export file, which is
exactly what `packages/astromech/src/exports/` already is — twenty-three
entrypoint files backing the subpaths in `packages/astromech/package.json`.

Directus encodes the same thing in directories plus subpaths: `@directus/utils`
exports `.` at `dist/shared/index.js` alongside `./node` and `./browser`, backed
by `shared/`, `node/` and `browser/` sources.

Searched for directly, `*.shared.ts` as a browser/server marker has no precedent
in any notable TypeScript project. The established suffixes are `.service.ts`,
`.component.ts`, `.spec.ts`, `.d.ts` and `.internal.ts`. It is a coinage, and it
never got the `TERMINOLOGY.md` entry `AGENTS.md` requires of one.

## A package boundary is not self-enforcing either

Directus issue 26613 is the case that decides the shape. Commit `50b496f` moved
test utilities into `packages/utils/shared/`; two of them imported `node:assert`;
client-side extension loading broke with a Content Security Policy violation on
`script-src`. A real package, real subpath exports, and Node-only code still
reached the browser, because nothing checked what went into `shared/`.

So the choice is not "filename versus package". It is what performs the check,
and a separate `@astromech/shared` package buys the least of the three: it
reverses `0074`, adds a third publishable unit, and Directus shows it does not
hold on its own.

## Decided

**The browser-safe surface is declared in the `exports` map, not in filenames.**
An `exports/shared.ts` entrypoint plus a `"browser"` condition puts the boundary
where Node and every bundler already enforce it, at publish time, and `exports/`
is how this package publishes everything else. The suffix is then redundant and
retires.

**Files stay with their subject.** `0074` decided that a pure leaf is placed by
the subject it describes rather than in a bucket, and nothing here overturns it.
The five domain leaves the admin needs keep their homes; only the specifier the
admin reaches them by changes.

**No `@astromech/shared` package**, for the reasons above.

## What blocks it, and why this is not done now

`integrations/astro/vite.ts` aliases `'@/'` to the whole of the package's `src/`,
unrestricted, inside the consuming project's Vite graph. Every admin import
resolves through that alias, so an `exports` map binds nothing while it stands —
the admin never goes through the front door. The alias exists so plugin
components share module identity (React context, hooks) with the admin, which
`roadmap/planned/admin-as-its-own-package.md` records as surviving the split.

Narrowing that alias is the real work, and it belongs to the admin split rather
than in front of it. Until then the suffix stays, because removing a marker that
enforces nothing in favour of an entrypoint that also enforces nothing would be
motion rather than progress.

## Rejected

- **Delete the suffix now and add nothing.** Honest, and it loses the one thing
  the marker still does: tell a reader in a diff that a file is reachable from
  the browser. Worth keeping until the declared boundary exists to replace it.
- **Keep the suffix and re-add a lint rule.** This is `0036` again, and `0070`
  is the record of why that ruleset cost more than it caught.
- **A `shared/` directory per package.** Directus's shape, and the one issue
  26613 happened inside.
