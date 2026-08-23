# 0019 — a `defineX` returns an `X`

**Date:** 2026-08-04
**Status:** accepted

`Descriptor` and `Definition` stop being suffixes: a `defineX` factory's return takes the bare noun (`FieldTypeDescriptor` → `FieldType`, `FieldType` → `FieldTypeName`, `EntryTypeConfig` → `EntryType`, `TableDescriptor` → `Table`) and derived forms take existing prefixes (`Resolved*`, `Registered*`). `ServiceMethodDescriptor` → `ServiceMethodContract` after ts-rest; `defineRegistry` → `createRegistry`; `defineCommand`, `definePluginTable`, `defineAdminPage` and `defineFieldType` fell out of scope.
