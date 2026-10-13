---
area: structure
---

# Admin resources bind screens to plugin methods

A plugin declares `defineAdminResource` under `admin.resources`: a list, create and edit screen, each naming the service method behind it, drawn by the same storage-agnostic list and form components as entries (`packages/astromech/src/plugins/define-admin-resource.ts`). An edit screen with no update method renders read-only. Boot checks that each method exists and passes its permission to the admin. Prior art: Django admin, Filament, react-admin and Refine.

**Rejected:** admin pages written from scratch for each plugin; an entry type only to get admin screens.
