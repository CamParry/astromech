# Astro 7 and Kysely 0.29

Astromech's peer ranges are `astro@^6.0.8` and `kysely@^0.28.14`
(`packages/astromech/package.json`). Both have moved on, and an unpinned
install now fails with `ERESOLVE`:

- `astro` latest is 7.3.2, and `@astrojs/node` latest (11.1.5) requires
  `astro@^7.2.1`.
- `@astrojs/react` 6 requires Vite 8, so it pairs with Astro 7, not 6.
- `kysely` latest is 0.29.5, outside `^0.28.14`.

Found on 2026-09-15 while testing `apps/docs/installation.md` against the
registry. The page pins `astro@6 kysely@0.28 @astrojs/react@5 @astrojs/node@10`
until this lands.

## The work

- [ ] Read the Astro 7 upgrade guide and the Vite 8 changes against what core
      relies on: `injectRoute`, `addMiddleware`, `updateConfig`, the dev
      server's `optimizeDeps` (including the nested `a > b > c` entries in
      `packages/astromech/src/integrations/astro/vite.ts`), `astro sync`, and
      the Cloudflare adapter.
- [ ] Read the Kysely 0.29 changelog against the dialects and
      `@libsql/kysely-libsql`, which pins its own Kysely range.
- [ ] Widen or move each peer range, upgrade both demo apps, and run the gate
      with both boot checks.
- [ ] Remove the pins from `apps/docs/installation.md` and
      `packages/astromech/README.md`.
