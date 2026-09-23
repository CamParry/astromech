# Remove the settings module

Core's `settings` key-value store has no consumer. Every plugin keeps its
configuration in a global (`seo/src/globals/settings.ts`,
`backups/src/globals/settings.ts`, the menus globals), and nothing in the admin,
the plugins or either demo calls `settings`. Its documented rule, "only the
naked `plugin:*` key-value class", is not enforced: `settings/methods/set.ts`
accepts any key and `ctx.settings` has no namespace prefix, so one plugin can
overwrite another's keys. `settings.updatedBy` is declared and never written.

It still costs a second visibility system (`publicSettings` →
`publicSettingKeys` → `isPublicSettingKey`), a REST route, client methods and
a table.

## The work

- [x] Delete `packages/astromech/src/settings/`, `transport/http/routes/settings.ts`,
      the settings rows in `transport/http/routes/http-routes.ts`, the `settings`
      members of `ScopedServices`, `trustedServices`, `AppContext` and the
      `Astromech` instance, its entry in `codegen/method-manifest.ts`,
      `settingsService`/`settingValue` in `transport/http/client.ts`, and
      `withDefaultSettingsShape`.
- [x] Delete `config/public-settings.ts`, the `publicSettings` config key,
      `publicSettingKeys` on `ResolvedConfig` and `PluginConfigView`, the
      `settings:read`/`settings:update` permissions, and the admin's unused
      `queryKeys.settings`.
- [x] Drop `settingsTable` from `CORE_TABLES`, run `pnpm run db:generate`, and
      hand-apply the change to `apps/demo-cloudflare`'s migration and snapshot.
- [x] Delete the settings tests and the settings rows in the client, MCP, CLI,
      method-filter and app-context tests.
- [x] Rewrite the `DECISIONS.md` entry to: core ships no key-value store; plugin
      state is a global, a plugin table or `ctx.storage`. Fix every other
      mention in `DECISIONS.md`, `TERMINOLOGY.md`, `ARCHITECTURE.md`,
      `apps/docs/` and the assistant's prompt (`loop/request.ts`).

If a plugin later needs a private key-value store, add a namespaced `ctx.kv`
backed by a plugin table rather than a shared table without prefix enforcement.
