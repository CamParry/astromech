/**
 * The admin test files that must each get a fresh module graph.
 *
 * Like core's, the admin's suite runs with `isolate: false`, so a worker imports
 * the module graph once and reuses it across files. A file listed here opts back
 * into per-file isolation because it mocks a module other files import, resets
 * the module registry, stubs a global, or writes a global (all of which leak
 * across files in a shared graph).
 *
 * `tests/isolation-list.test.ts` fails if this list and the files that actually
 * do those things disagree, so it cannot drift.
 */
export const isolatedTests = [
    'tests/components/admin-resources/admin-resource-pages.test.tsx',
    'tests/pages/_protected/index.test.tsx',
    'tests/components/globals/global-versions-page.test.tsx',
    'tests/components/entries/locale-switcher.test.tsx',
    'tests/components/entries/entry-edit-cache-invalidation.test.tsx',
    'tests/components/entries/entry-edit-locale-switch.test.tsx',
    'tests/components/entries/entry-edit-meta.test.tsx',
    'tests/components/entries/entry-edit-unsaved-changes.test.tsx',
    'tests/components/entries/entry-edit-view-link.test.tsx',
    'tests/components/entries/entry-edit-status.test.tsx',
    'tests/components/entries/entries-list-page.test.tsx',
    'tests/components/globals/global-edit-page.test.tsx',
    'tests/components/layout/sidebar-globals.test.tsx',
    'tests/components/layout/sidebar-security.test.tsx',
    'tests/components/security/security-page.test.tsx',
    'tests/components/fields/plugin-field-loading.test.tsx',
    'tests/components/fields/reference-field-loading.test.tsx',
    'tests/components/media/media-detail-modal-replace.test.tsx',
    'tests/components/media/media-detail-modal.test.tsx',
    'tests/components/media/media-picker.test.tsx',
    'tests/components/media/media-upload-dialog.test.tsx',
    'tests/components/users/user-edit-page.test.tsx',
    'tests/components/users/users-list-page.test.tsx',
    'tests/components/users/user-new-page.test.tsx',
    'tests/hooks/author-names.test.tsx',
    'tests/hooks/entry-mutations.test.tsx',
    'tests/hooks/use-bulk-delete-media.test.tsx',
    'tests/hooks/use-media-browser.test.tsx',
    'tests/hooks/use-media-versions.test.tsx',
    'tests/components/entries/create-locale-modal.test.tsx',
    'tests/components/entries/delete-entry-modal.test.tsx',
    'tests/components/entries/entry-new-page.test.tsx',
    'tests/components/layout/app-shell.test.tsx',
    'tests/components/layout/notification-bell.test.tsx',
    'tests/components/layout/topbar.test.tsx',
    'tests/components/ui/command-palette.test.tsx',
    'tests/forgot-password-form.test.tsx',
    'tests/login-access-denied.test.tsx',
    'tests/login-captcha.test.tsx',
    'tests/captcha-renderer.test.ts',
    'tests/login-setup-redirect.test.ts',
    'tests/logout-route.test.ts',
    'tests/query-client.test.tsx',
    'tests/setup-form.test.tsx',
];
