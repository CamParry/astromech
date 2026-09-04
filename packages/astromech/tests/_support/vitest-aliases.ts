/**
 * The vitest alias map shared by core's suite and the first-party plugins'.
 *
 * Every path into core resolves to `src`, never `dist`. A plugin's `src`
 * imports `astromech` and its tests import `@/...`; if those resolved to
 * different trees the test would hold two copies of `config/registry.ts` and
 * `setDb` would land in the one the code under test does not read.
 */
import { fileURLToPath } from 'node:url';

export function coreAliases(): Record<string, string> {
    return {
        // Admin virtual modules, normally injected by the Astro integration.
        'virtual:astromech/admin-config': fileURLToPath(
            new URL('./admin-config-shim.ts', import.meta.url)
        ),
        'virtual:astromech/plugins/components': fileURLToPath(
            new URL('./plugins-components-shim.ts', import.meta.url)
        ),
        '@': fileURLToPath(new URL('../../src', import.meta.url)),
        '@tests': fileURLToPath(new URL('../../tests/_support', import.meta.url)),
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
        'astromech/ui/app': fileURLToPath(
            new URL('../../src/exports/admin/ui-app.ts', import.meta.url)
        ),
        'astromech/ui': fileURLToPath(
            new URL('../../src/exports/admin/ui.ts', import.meta.url)
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
