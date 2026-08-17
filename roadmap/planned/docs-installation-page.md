# An Installation Page

`apps/docs` has no installation or setup page. Nothing there shows an
`astro.config.mjs`, and nothing shows the integration being called. A reader
starting from zero has no first page.

This surfaced because the integration's signature changed and there was nothing
to update. `astromech()` takes a config **path** now — it defaults to
`./astromech.config.ts` and accepts `{ configFile }` to point elsewhere — and
that option is documented only in the docblock at the top of
`packages/astromech/src/integrations/astro/index.ts`.

## What it has to cover

- Installing the package, and the `astro.config.mjs` the integration goes into.
- `astromech()` and `{ configFile }`.
- That config paths resolve against the working directory, so commands run from
  the project root. `apps/docs/configuration/database.md` states this for the
  database; the general rule wants a home earlier in the reading order.
- Which optional peers a site installs for itself, and when. `nodemailer` for
  `smtp()`, `wrangler` for local Cloudflare bindings. Both are declared
  optional, so npm does not install them and the failure is deferred to first
  use.

## What to work out first

Whether this is one page or the front of a sequence, and where it sits in
`apps/docs/README.md`'s ordering. The `docs` skill's contract applies: a page is
a how-to, a reference, or an explanation, and an installation page is a how-to,
so the explanation of why the config is a path belongs in
`decisions/0030-the-server-loads-the-config-as-a-module.md` and stays linked
rather than restated.
