# Module-scope config reads are unguarded

Config reaches the runtime through `packages/astromech/src/config/registry.ts`
at boot, and the application instance through `getAstromech()`. A module that
reads either at module scope throws, because Astro evaluates a page module
before the request that boots the application. Nothing in the gate catches this
except `check:boot`, and only for the one page it requests.

## How it presented

`apps/demo/src/lib/site.ts` built two constants at module scope from the
application's config, through an accessor that has since been removed. The
homepage **hung** rather than returning 500. The node adapter answers an
unhandled rejection during render by logging it and holding the socket open, so
the failure presented as a timeout with the server idle at 0% CPU. Nine of the
ten gate checks passed on that build; `check:boot` was the only one that saw it,
and only because it requests `/`.

The core moved about 30 sites off module-scope config in
`roadmap/completed/application-instance-and-integrations.md`. Nothing stops the
next one being written, in core or in a host app, and the failure is a hang
rather than an error.

## Decisions

- **A lint rule refuses a call to `getConfig()` or `getAstromech()` outside a
  function.** It applies to every TypeScript file ESLint sees except tests and
  scripts: core through `pnpm run lint`, and plugins and host apps through the
  pre-commit hook, which lints every staged file. A class field initialiser runs
  at construction, so it is allowed. `.astro` files are not linted, and their
  frontmatter runs per request, so they need no rule.
- **Both errors name the likely cause.** `getConfig()` and `getAstromech()` say
  that a call at module scope runs before boot, not only that nothing is
  configured yet.

## The work

- [ ] The lint rule in `eslint.config.js`, in every block that restates
      `no-restricted-syntax`.
- [ ] The two error messages.
- [ ] `ARCHITECTURE.md`'s config paragraph names the rule.

## Not in scope

Making config available at module scope. That would reinstate the coupling the
application-instance work removed.
