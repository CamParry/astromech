# Type-check `apps/demo`

Nothing in the gate type-checks `apps/demo`. Running `tsc` against it by hand on
2026-08-08 found **17 errors**, and most of them are core defects the demo is
merely the first caller to hit — which is the argument for wiring it into the
gate rather than fixing the 17 and moving on.

The demo is the only place that consumes the generated types the way a site
does, so it is the only place these can surface at all.

## The three clusters

- [x] **Generated field types cannot be used as `Entry` (9 errors, `src/lib/data.ts`).**
      `TypedEntry<PostFieldsPublic>` is not assignable to `Entry`, so every
      helper returning `Entry`/`Entry[]` fails. The cause is a one-word decision
      in the emitter: `codegen/type-generator.ts` writes
      `export interface PostFieldsPublic { … }`, and a TypeScript **interface**
      never receives an implicit index signature, so it cannot satisfy
      `Entry['fields']`, which is `JsonObject`. A `type` alias does receive one.
      Emitting `export type PostFieldsPublic = { … }` is the whole fix; adding
      `[k: string]: unknown` by hand would work too and is worse, because it
      reopens the type to any key.
      The alias alone left three of the nine: the `blocks` element type carried
      an inline `[key: string]: JsonValue | undefined` index signature, and
      `JsonValue | undefined` is not `JsonValue`. It now intersects `JsonObject`
      instead. `DECISIONS.md` has the reasoning.
- [x] **Plugin tables are absent from the `DB` union (4 errors, `seed.ts`).**
      `'plugin_redirects_redirects'` is rejected against a union of the 14 core
      tables. The `PluginDB` augmentation is not reaching a site's own
      `tsconfig`, so a site cannot query a plugin's table through the shared
      builder even though the table exists.
      The diagnosis above is wrong and the record is in `DECISIONS.md`: `DB` is
      a `type` alias and is not publicly exported, so there is no augmentation
      and never was. `PluginDB` is an explicit cast at the call site, which is
      what `seed.ts` now does. One of the four was unrelated — an optional
      `placeholder` on the `ImageDriver` contract.
- [x] **Demo-side narrowing (4 errors, `src/middleware.ts`, `src/pages/sitemap.xml.ts`).**
      `Astromech.plugins` is possibly `undefined` at two call sites, a redirect
      status is typed `number` where Astro wants the literal union, and one call
      is missing an argument. These are genuinely the demo's own, and the
      `plugins` one is worth a look before it is silenced — an optional-typed
      accessor that every caller must guard may be the wrong shape.
      It was the wrong shape: `plugins` is required now. The missing argument
      was core's too — `ServiceInterface` made an `undefined`-input method's
      parameter mandatory.

Two things this surfaced are generator work rather than typecheck fixes, and
moved to `roadmap/planned/plugin-tables-on-the-site-handle.md`: a site still has
to name a plugin's table module to reach its tables, and `encodeWith` returns
`Record<string, unknown>` rather than its table's insert shape.

## Then wire it into the gate

- [x] Add a `typecheck` script to `apps/demo` and include it in the root
      `typecheck`. Until that happens the next regression of this kind is
      invisible again, and `AGENTS.md` has to keep carrying "apps/demo has no
      typecheck" as a standing warning.

`.astro/` generated output is part of what gets checked, so the script has to run
after `astro sync`. Confirm the ordering works in CI, not just locally.

- [x] Confirmed on `main`: `astro sync && tsc --noEmit` in one script, run after
      `npm run build`, reports zero errors. The CI typecheck job builds first for
      the same reason.
