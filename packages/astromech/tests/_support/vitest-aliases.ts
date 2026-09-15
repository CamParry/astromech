/**
 * The vitest alias map shared by core's suite, the admin's and the first-party
 * plugins'. `@tests` is core's shared test support.
 *
 * Every path into core resolves to `src`, never `dist`. A plugin's `src`
 * imports `astromech` and its tests import `@/...`; if those resolved to
 * different trees the test would hold two copies of `config/registry.ts` and
 * `setDb` would land in the one the code under test does not read. The admin
 * package resolves to its `src` for the same reason.
 */
import { fileURLToPath } from 'node:url';

export function coreAliases(): Record<string, string> {
    return {
        '@': fileURLToPath(new URL('../../src', import.meta.url)),
        '@tests': fileURLToPath(new URL('../../tests/_support', import.meta.url)),
        // The admin package's subpaths, which core imports and re-exports.
        // Longest first, as below.
        '@astromech/admin/vite': fileURLToPath(
            new URL('../../../admin/src/vite.ts', import.meta.url)
        ),
        '@astromech/admin/ui/app': fileURLToPath(
            new URL('../../../admin/src/exports/ui-app.ts', import.meta.url)
        ),
        '@astromech/admin/ui/layout': fileURLToPath(
            new URL('../../../admin/src/exports/ui-layout.ts', import.meta.url)
        ),
        '@astromech/admin/ui/fields': fileURLToPath(
            new URL('../../../admin/src/exports/ui-fields.ts', import.meta.url)
        ),
        '@astromech/admin/ui': fileURLToPath(
            new URL('../../../admin/src/exports/ui.ts', import.meta.url)
        ),
        // First-party plugin packages and the public subpaths they consume
        // resolve to source under vitest (no build step before tests). The
        // subpath aliases MUST precede the bare `astromech` alias so the
        // longest match wins.
        'astromech/fields': fileURLToPath(
            new URL('../../src/exports/fields.ts', import.meta.url)
        ),
        'astromech/columns': fileURLToPath(
            new URL('../../src/exports/columns.ts', import.meta.url)
        ),
        'astromech/email': fileURLToPath(
            new URL('../../src/exports/email.ts', import.meta.url)
        ),
        'astromech/shared': fileURLToPath(
            new URL('../../src/exports/shared.ts', import.meta.url)
        ),
        'astromech/fetch': fileURLToPath(
            new URL('../../src/exports/fetch.ts', import.meta.url)
        ),
        'astromech/ui/app': fileURLToPath(
            new URL('../../src/exports/ui-app.ts', import.meta.url)
        ),
        'astromech/ui': fileURLToPath(
            new URL('../../src/exports/ui.ts', import.meta.url)
        ),
        astromech: fileURLToPath(new URL('../../src/exports/index.ts', import.meta.url)),
        // The schema engine resolves to source under vitest (no build step
        // before tests). Subpath alias FIRST, longest match must win.
        '@astromech/schema-engine/generate': fileURLToPath(
            new URL('../../../schema-engine/src/generate.ts', import.meta.url)
        ),
        '@astromech/schema-engine': fileURLToPath(
            new URL('../../../schema-engine/src/index.ts', import.meta.url)
        ),
    };
}
