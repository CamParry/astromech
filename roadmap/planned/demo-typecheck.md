# Type-check `apps/demo`

Nothing in the gate type-checks `apps/demo`. Running `tsc` against it by hand on
2026-08-08 found **17 errors**, and most of them are core defects the demo is
merely the first caller to hit — which is the argument for wiring it into the
gate rather than fixing the 17 and moving on.

The demo is the only place that consumes the generated types the way a site
does, so it is the only place these can surface at all.

## The three clusters

- [ ] **Generated field types cannot be used as `Entry` (9 errors, `src/lib/data.ts`).**
      `TypedEntry<PostFieldsPublic>` is not assignable to `Entry`, so every
      helper returning `Entry`/`Entry[]` fails. The cause is a one-word decision
      in the emitter: `codegen/type-generator.ts` writes
      `export interface PostFieldsPublic { … }`, and a TypeScript **interface**
      never receives an implicit index signature, so it cannot satisfy
      `Entry['fields']`, which is `JsonObject`. A `type` alias does receive one.
      Emitting `export type PostFieldsPublic = { … }` is the whole fix; adding
      `[k: string]: unknown` by hand would work too and is worse, because it
      reopens the type to any key.
- [ ] **Plugin tables are absent from the `DB` union (4 errors, `seed.ts`).**
      `'plugin_redirects_redirects'` is rejected against a union of the 14 core
      tables. The `PluginDB` augmentation is not reaching a site's own
      `tsconfig`, so a site cannot query a plugin's table through the shared
      builder even though the table exists.
- [ ] **Demo-side narrowing (4 errors, `src/middleware.ts`, `src/pages/sitemap.xml.ts`).**
      `Astromech.plugins` is possibly `undefined` at two call sites, a redirect
      status is typed `number` where Astro wants the literal union, and one call
      is missing an argument. These are genuinely the demo's own, and the
      `plugins` one is worth a look before it is silenced — an optional-typed
      accessor that every caller must guard may be the wrong shape.

## Then wire it into the gate

- [ ] Add a `typecheck` script to `apps/demo` and include it in the root
      `typecheck`. Until that happens the next regression of this kind is
      invisible again, and `AGENTS.md` has to keep carrying "apps/demo has no
      typecheck" as a standing warning.

`.astro/` generated output is part of what gets checked, so the script has to run
after `astro sync`. Confirm the ordering works in CI, not just locally.
