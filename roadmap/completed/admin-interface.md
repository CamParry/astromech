# Admin Interface

- [x] SPA foundation: `src/admin/main.tsx`, TanStack Router, catch-all `shell.astro`, `virtual:astromech/admin-config`, i18next setup
- [x] Auth & session: `AuthContext`/`useAuth`, login/forgot/reset/first-run-setup pages, `_protected`/`_auth` `beforeLoad` route guards, React Query-backed session
- [x] Layout: AppShell, Sidebar (brand, config-derived nav, plugin nav, collapsed/drawer states), Topbar (breadcrumb, user menu), `UIContext`
- [x] UI component library (`src/admin/components/ui/`) — Button, Input, Textarea, Select, Checkbox/Toggle, Badge, Modal, Dropdown, Toast, Panel, Table, Toolbar, Tabs, Breadcrumb, Spinner/Skeleton, Empty State, Avatar, Tooltip; design tokens + dark-mode overrides; `astromech/ui` export
- [x] Pages: dashboard; entry list (sortable columns, search, status filter, pagination, row + bulk actions, list/grid toggle); entry create/edit (field groups, `FieldInput` dispatcher, save/publish); users list/edit; media library
- [x] App-defined settings pages: `admin.pages` + `defineSettingsPage()`, field-tree form at `/page/{path}`, stored in `settings` table (locale-aware `{path}:{locale}`), sidebar "Pages" group gated `settings:read`/`settings:update`
- [x] React Query hooks layer (`useEntries`/`useMedia`/`useUsers` + mutations, query-key factories); replaced all inline `useQuery`/`useMutation`
- [x] File-based routing migration (`src/admin/pages/`, generated route tree); co-located search params, loaders, and guards
- [x] Definition-driven admin: `deriveTableDefinition`/`deriveFormDefinition` + cell-kind / field-type registries replace hand-written column loops and the field `switch`
- [x] Polish: locale-aware date formatting, URL-synced list search params, binary light/dark toggle (cookie-driven, zero-flash), raised-surface tokens + ghost icon buttons, full mobile responsiveness (off-canvas sidebar, responsive forms/tables, 44px touch targets)
