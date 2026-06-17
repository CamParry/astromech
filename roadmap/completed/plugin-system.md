# Plugin System

- [x] Plugin runtime: `definePlugin` factory + identity derivation, declarative `PluginDefinition`, unified `PluginContext`, open hook registry + `ctx.emit`
- [x] SDK namespace `Astromech.plugins.X` (runtime registry + Proxy), auto-mounted RPC API `/api/plugins/{name}/{method}` with access enforcement + raw escape hatch, plugin Drizzle schema collection + prefix guard
- [x] Failure isolation (crash-loud boot, before-aborts/after-swallows, per-request `onError`, per-job try/catch), `dependsOn` semver + ordering checks
- [x] Plugin admin UI: field-group `placement: 'tab'`, `registerFieldType`, permission-gated plugin nav tree, `/admin/plugin/{name}/*` catch-all, per-plugin error boundaries, auto-rendered settings page, public browser exports (`astromech/ui/fields`, `astromech/ui/layout`, `astromech/db`, `useAstromechPlugin()`), component + i18n code-gen + `astromech.d.ts` augmentation
- [x] Namespaced plugin entries: qualified `{plugin}/{type}` identity, per-namespace entries API + typed SDK, `ctx.entries` scoping, `tableStorage()`, app-owned `db:generate` orchestration
- [x] Shipped **`@astromech/redirects`** — own table, slug-change `entry:afterUpdate` hook, typed `lookup` SDK
- [x] Shipped **`@astromech/seo`** — composed `seoSection()` (core text/textarea with `count` length hints + custom `seo-preview` field, namespaced under the `seo` key), dashboard, settings, sitemap/OG via SDK, non-AI length recommendations
