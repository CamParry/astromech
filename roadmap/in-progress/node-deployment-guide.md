# Node deployment guide

`apps/docs/deployment/` has a Cloudflare page and nothing for Node, the
runtime `apps/docs/installation.md` sets up with `@astrojs/node`. A new site
can build, but no page says how to run the build in production.

Found on 2026-09-15 by a site installed from packed tarballs, which served its
build with `node dist/server/entry.mjs`, `HOST`, `PORT` and
`BETTER_AUTH_SECRET`, working that out from Astro's adapter docs.

## The work

- [ ] A Node page in `apps/docs/deployment/`: build, the environment it needs
      (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, the database URL), running
      migrations before start, and serving `dist/server/entry.mjs`.
- [ ] Link it from the end of `apps/docs/installation.md`.
- [ ] Check whether a built Node server serves files uploaded after the build
      to `./public/uploads`, the `filesystem()` pairing the installation guide
      and `apps/docs/configuration/storage.md` recommend with
      `urlPrefix: '/uploads'`. The standalone adapter serves `dist/client`, so
      those files may 404. If they do, fix the recommendation.
