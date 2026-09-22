# Audit findings, September 2026

An index of the read-only audit of 2026-09-22, which covered request call
depth, `AppContext` against the request store, module consistency and
duplication. Every finding now has a home in a feature file; this file groups
them by root cause and orders the work. Tick a line when its file moves to
`completed/`, and delete this file once every line is ticked.

The findings share one pattern: consistency has been restored by periodic
sweeps (17 of them in `roadmap/completed/`) rather than built in, so each drift
returned. Every file below therefore ends with a guard, a type, lint rule or
test that makes the next copy fail.

## By root cause

- [ ] **Policy lives in the transports.** Publish bypass, REST-only field and
      last-admin checks, domain errors answering 500, CLI commands that never
      boot the app, drafts exposed through plugin reads, the hardcoded `'en'`:
      `planned/policy-in-the-service-layer.md`. The remaining route and parity
      work: `planned/route-table-handlers.md`.
- [ ] **Two contexts leak into each other.** Hooks rebuilding context from the
      store, user and role held three times, `CronContext`, the session
      resolved twice: `planned/explicit-app-context.md`.
- [ ] **The service handle is built in seven places**, each with its own cast
      and default shape: `planned/one-service-handle.md`.
- [ ] **Field behaviour is split between `FieldType` and walkers** that branch
      on type names; plugin field types never reach the server:
      `planned/field-tree-traversal.md`.
- [ ] **The resource module shape stops at the repository.** Copied versions,
      staging, locale, uniqueness and error code; globals missing from the
      relationships index; sort allow-lists; globals' status run in the
      browser: `planned/resource-module-shape.md`.
- [ ] **Plugin contributions take a parallel path** through config, codegen,
      permissions and the admin: `planned/plugin-types-in-core-registries.md`.
- [ ] **Admin pages share no composition.** Copied staging controls, 16
      mutation bodies, a duplicate key factory, a stale dashboard, the missing
      AI-context globals case: `planned/admin-resource-views.md`.
- [ ] **Rules live in prose only.** Test-only exports, no typed lint, retired
      words, lookup verbs, names, stale comments:
      `planned/enforced-conventions.md`.
- [ ] The unused `settings` module: `planned/remove-settings-module.md`.
- [ ] Plugin raw routes kept as closures, and the stale `virtual:` reasoning:
      `planned/plugin-route-entrypoints.md`.
- [ ] No consumer for a `col.reference` resolver, and the one-at-a-time lookups
      in `media/methods/used-by.ts`: `planned/col-reference-resolution.md`.
- [ ] Scheduled publish times shift by the timezone offset on every save
      (`entry-edit-page.tsx`, `global-edit-page.tsx`); use
      `formatDatetimeForInput`.
- [x] Named layout fields: `roadmap/completed/named-layout-fields.md`.

## Order

At most two branches run at once.

1. `policy-in-the-service-layer.md` with `explicit-app-context.md` (the
   `services` branch), beside the `col.reference` follow-ups and the date fix.
2. `field-tree-traversal.md` in the next free slot.
3. After `services`: `remove-settings-module.md`, then `one-service-handle.md`,
   then `route-table-handlers.md`. `resource-module-shape.md` can start once
   `services` lands. The knip and typed-lint items of `enforced-conventions.md`
   need nothing and can fill a gap.
4. After field traversal: `plugin-types-in-core-registries.md`, then
   `plugin-factory-extras.md` (it rewrites seo's `fields/groups.ts`).
5. After resources, the service handle and plugin types:
   `admin-resource-views.md`.
6. Last: the naming items in `enforced-conventions.md`, since the admin pages
   are rewritten first.
