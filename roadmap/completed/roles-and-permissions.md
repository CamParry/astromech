# Roles & Permissions

- [x] `roles` table; roles defined in code via `AstromechConfig.roles` + built-in `admin`/`editor` defaults
- [x] Permission-checking utility (`src/policies/permissions/permissions.ts`); enforced across all API handlers; role assignment in user create/edit; permission-gated UI; read-only form mode
- [x] Permissions grammar overhaul: `resource:identifier:action`, segment-wise wildcards, `definePermissionBundles` + `builtInRole()`, secure-by-default plugin data
