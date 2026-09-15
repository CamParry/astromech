# New site warnings

A new site that follows `apps/docs/installation.md` works, but shows warnings
the guide does not explain. Found on 2026-09-15 by a site installed from packed
tarballs.

## The warnings

- **npm install:** 21 deprecation lines. 20 come from `@react-email/components`
  1.0.12 (`packages/astromech/package.json` asks for `^1.0.10`) and its
  `@react-email/*` subpackages: "Package no longer supported". The other is
  `node-domexception`. The tree also holds two copies of `@react-email/render`
  (2.0.6 through `components`, 2.1.0 as core's own dependency).
- **`astro dev`, on each `/cms` load:** `defaultLocale "en" has no
content-locale match in []; content falls back to "en".` The guide's config
  sets no locales, and `packages/admin/src/main.tsx` warns whenever
  `resolveContentLocale()` finds no match, including when the list is empty.
- **`astro build`:** Vite's "Some chunks are larger than 500 kB" warning. The
  admin app builds as one 1.71 MB chunk.

`@libsql/kysely-libsql` 0.4.1 also installs its own `@libsql/client` 0.8.1.
That copy is never loaded, because the `libsql()` driver builds the client from
the site's own `@libsql/client` and hands it to the dialect.

## The work

- [x] Replace `@react-email/components` with the packages core imports, or
      with whatever React Email now publishes in its place. React Email 6 moved
      every component and `render` into `react-email`, which since 6.7 marks
      itself side-effect free, so a Worker bundles only the components core
      imports. It installs React Email's CLI dependencies with it, 53 more
      packages in a new site.
- [x] Skip the `defaultLocale` warning when the site declares no locales.
- [x] Split the admin bundle by route, or decide the size is acceptable for an
      admin app and raise Vite's `chunkSizeWarningLimit` for it. Split with
      `autoCodeSplitting`, which needs `astromech()` before `react()`, and
      bundle only the Lucide icons the config names, which were 475 kB of the
      largest chunk.

A site installed from packed tarballs on 2026-09-15 showed none of the three.
Its install printed only `node-domexception`'s deprecation, which comes through
`@libsql/kysely-libsql`, and its largest admin chunk was Tiptap's, at 397 kB.
It also found no Node deployment page, now `roadmap/planned/node-deployment-guide.md`.
