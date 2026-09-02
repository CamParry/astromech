/**
 * The test files that must each get a fresh module graph.
 *
 * The suite runs with `isolate: false` so a worker imports the module graph
 * once and reuses it across files, which is where most of the run time went.
 * A file listed here opts back into per-file isolation because it mocks a
 * module other files import, stubs a global, or writes `globalThis.__astromech`
 * (all of which leak across files in a shared graph).
 *
 * `tests/isolation-list.test.ts` fails if this list and the files that actually
 * do those things disagree, so it cannot drift.
 */
export const isolatedTests = [
    'tests/admin/components/entries/entry-edit-locale-switch.test.tsx',
    'tests/admin/components/globals/global-edit-page.test.tsx',
    'tests/admin/components/layout/sidebar-globals.test.tsx',
    'tests/admin/components/fields/plugin-field-loading.test.tsx',
    'tests/admin/components/fields/reference-field-loading.test.tsx',
    'tests/admin/components/media/media-detail-modal-replace.test.tsx',
    'tests/admin/components/media/media-detail-modal.test.tsx',
    'tests/admin/components/media/media-picker.test.tsx',
    'tests/admin/components/plugins/plugin-slot.test.tsx',
    'tests/admin/hooks/use-bulk-delete-media.test.tsx',
    'tests/admin/hooks/use-media-browser.test.tsx',
    'tests/ai/model-access.test.ts',
    'tests/astromech.test.ts',
    'tests/codegen/manifest-registry.test.ts',
    'tests/cron/runner.test.ts',
    'tests/cron/scheduled-boot.test.ts',
    'tests/cron/scheduled-handler.test.ts',
    'tests/plugins/backups/backups.test.ts',
    'tests/plugins/forms/rate-limit.test.ts',
    'tests/plugins/forms/spam.test.ts',
    'tests/plugins/runtime/plugin-runtime.test.ts',
    'tests/registry.test.ts',
    'tests/request-context/request-context.test.ts',
    'tests/services/entries/create-atomicity.test.ts',
    'tests/services/entries/duplicate-atomicity.test.ts',
    'tests/services/entries/restore-atomicity.test.ts',
    'tests/services/entries/staging-create-atomicity.test.ts',
    'tests/services/users/auth-base-path.test.ts',
    'tests/services/users/auth-signup.test.ts',
    'tests/services/users/role-validation.test.ts',
    'tests/storage/drivers/s3.test.ts',
    'tests/transport/http/client-address.test.ts',
    'tests/transport/http/client/entries-service.test.ts',
    'tests/transport/http/client/globals-service.test.ts',
    'tests/transport/http/client/media-upload-path.test.ts',
    'tests/transport/http/client/methods.test.ts',
    'tests/transport/http/routes/app-root.test.ts',
    'tests/transport/http/routes/cron.test.ts',
    'tests/transport/http/routes/plugins-contract.test.ts',
    'tests/transport/http/routes/rpc-parity.test.ts',
    'tests/transport/mcp/parity.test.ts',
    'tests/transport/tools/dispatch.test.ts',
    'tests/transport/tools/scoped-tools.test.ts',
];
