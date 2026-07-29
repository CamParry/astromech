# Roles & Permissions

- [x] `roles` table; roles defined in code via `AstromechConfig.roles` + built-in `admin`/`editor` defaults
- [x] Permission-checking utility (`src/policies/permissions/permissions.ts`); enforced across all API handlers; role assignment in user create/edit; permission-gated UI; read-only form mode
- [x] Permissions grammar overhaul: `resource:identifier:action`, segment-wise wildcards, `definePermissionBundles` + `builtInRole()`, secure-by-default plugin data

The bundle half of that last item is gone. Bundles were deleted (not renamed to
"groups") by Phase 3 of `plugin-authoring-experience.md` on 2026-07-29: under an
explicit opt-in model a named bundle is a coarse handle that conceals what it
grants, and the demo had the incident to prove it — `backups.permissions('manage')`
put database restore and delete on a content editor in one word.

The surface now is `definePermissions` (a flat declaration of bare keys), a
variadic `plugin.permissions('read', 'run')` accessor, `entryPermissions()` for
derived entry permissions, and `astromech permissions` to list the lot.
