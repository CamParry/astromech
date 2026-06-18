# Method manifest

Build-time JSON catalogue of every service-method descriptor, so the CLI, MCP
server, confirm gate and authoring AI all discover capability from one source.
First workstream of the AI integration (the rest stay planned).

- [x] `codegen/method-manifest.ts` generator — flattens core descriptor catalogues (media/users/settings), self-enumerates entries (type × action, mount-aware), reads plugin SDK methods partially
- [x] Zod `input`/`output` serialised to JSON Schema (`z.toJSONSchema`); static permissions emitted, dynamic ones flagged
- [x] Shared entry-permission helper extracted from `transport/http/routes/entries.ts` so the manifest and the route share one format (`entry:<type>:<action>` / `plugin:<ns>:entry:<type>:<action>`); plugin SDK keys plugin-scoped via `resolvePluginPermission` to match enforcement
- [x] Emitted at `astro:config:done` to `.astro/astromech.methods.json`
- [x] `generate:manifest` CLI command (mirrors `generate:types`)
- [x] Generator unit tests + helper parity tests

Scope (v1): method-call descriptors only. Entry-type content schemas
(`FieldDefinition[]` → JSON Schema) deferred — a `contentSchema` slot is reserved
on entry methods. Per-principal permission annotation and runtime serving land
later with the confirm gate / authoring plugin. See `backlog.md` for the
entry-`destructive`/unpublish reconciliation and the plugin descriptor-lite gap.
