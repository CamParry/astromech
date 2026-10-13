---
area: structure
---

# Admin pages share controllers and query keys

`packages/admin/src/hooks/use-query-keys.ts` is the one query key factory. Each resource module exports an `xMutations()` table of TanStack `mutationOptions` whose `meta` names its invalidations and toasts, run by `useAdminMutation`, and pages compose `useEditController` and `useListController`, after react-admin. A plugin page uses plain `useMutation`, since `useAdminMutation` toasts success on a failed plugin result.

**Rejected:** a hook per write (fifteen copies of one invalidation); invalidation in a global `MutationCache` (toasts need React context); a binding object built by each route.
