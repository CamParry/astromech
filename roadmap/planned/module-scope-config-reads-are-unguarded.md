# Module-scope config reads are unguarded

Config reaches the runtime through `config/registry.ts` at boot. A module that
reads it at module scope therefore throws, because Astro evaluates a page module
before the request that boots the application. Nothing in the gate catches this
except `check:boot`, and only for the one page it requests.

## How it presented

`apps/demo/src/lib/site.ts` built two constants at module scope:

```ts
export const LOCALES = Astromech.config.locales ?? ['en'];
export const DEFAULT_LOCALE = /* derived from Astromech.config */;
```

The homepage **hung** rather than returning 500. The node adapter answers an
unhandled rejection during render by logging it and holding the socket open, so
the failure presented as a timeout with the server idle at 0% CPU. Nine of the
ten gate checks passed on that build; `check:boot` was the only one that saw it,
and only because it requests `/`.

## Why a rule is worth having

The core migrated ~30 sites off module-scope config in
`roadmap/completed/…application-instance…`. Nothing stops the next one being
written, in core or in a host app, and the failure mode is a hang rather than an
error — the most expensive kind to diagnose.

- [ ] A lint rule that rejects a config read at module scope. `Astromech.config`
      and `getConfig()` are both reachable at module scope today.
- [ ] Decide whether it covers host apps (`apps/demo`) or only `packages/`. The
      defect that prompted this was in a host app, which argues for both.
- [ ] Consider whether `getConfig()`'s error can name the likely cause. It
      currently says config is not configured, which reads as a boot-order bug
      rather than "this line runs too early".

## Not in scope

Making config available at module scope. That would reinstate the weld the
application-instance work removed.
