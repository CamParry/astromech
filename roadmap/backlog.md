# Backlog

Loose tasks pulled from otherwise-shipped features.

- [ ] Remove the obsolete `src/admin/pages/_protected/settings/index.tsx` "Coming soon" placeholder + its sidebar footer link
- [ ] `db:migrate` CLI wrapper (drizzle-kit migrate) — `db:generate` already ships; deferred until a table-shipping first-party plugin needs it
- [ ] Dedicated `GET /search` endpoint + `search()` SDK method — only if a public/programmatic search surface is needed
- [ ] `searchable?: false` opt-out on `EntryTypeConfig` — add when a titled root type should be excluded from search
- [ ] Browser-verify the demo marketing site on port 4323
- [ ] Investigate version history for settings (app-pages + plugin settings pages currently KV-upsert, no revisions) — relevant if settings-backed features (e.g. menus) want revert/history the way entries get it
- [ ] Reconcile entry `destructive` semantics: the manifest (mirroring `entryGate`) marks `entries.delete` destructive, but TERMINOLOGY.md says entry delete is a reversible soft-delete (trash). Also `entries.publish` collapses publish+unpublish into one action, so the spec's "unpublish is destructive" (§3.6) can't be expressed. Revisit when the permission model gains `forceDelete`/`unpublish` actions
- [ ] Close the plugin SDK descriptor-lite gap: first-party plugin sdk methods (e.g. `menus.get`) omit `mutates`, so the manifest defaults them to `mutates:true` (over-gates a future confirm gate). Declare effect hints on first-party plugin methods, and/or add typed input/output schemas (the deferred `AnyPluginSdkMethod` never-variance work)
- [ ] Add `mount` / `contentSchema` (and clarify `entryType` vs Collection) to TERMINOLOGY.md once the manifest field names stabilise
