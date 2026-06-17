# Backlog

Loose tasks pulled from otherwise-shipped features.

- [ ] Remove the obsolete `src/admin/pages/_protected/settings/index.tsx` "Coming soon" placeholder + its sidebar footer link
- [ ] `db:migrate` CLI wrapper (drizzle-kit migrate) — `db:generate` already ships; deferred until a table-shipping first-party plugin needs it
- [ ] Dedicated `GET /search` endpoint + `search()` SDK method — only if a public/programmatic search surface is needed
- [ ] `searchable?: false` opt-out on `EntryTypeConfig` — add when a titled root type should be excluded from search
- [ ] Browser-verify the demo marketing site on port 4323
- [ ] Investigate version history for settings (app-pages + plugin settings pages currently KV-upsert, no revisions) — relevant if settings-backed features (e.g. menus) want revert/history the way entries get it
