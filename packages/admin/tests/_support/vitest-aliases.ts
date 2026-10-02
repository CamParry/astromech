/**
 * The vitest alias map for code that runs the admin's source: the admin's own
 * suite (`packages/admin/vitest.config.ts`) and a plugin's admin page tests
 * (`pluginVitestConfig({ adminPages: true })` in
 * `packages/astromech/tests/_support/plugin-vitest-config.ts`).
 *
 * It adds to core's aliases the admin's `src` as `@/admin`, and shims for the
 * three virtual modules a site's Vite serves the admin. Vite tries aliases in
 * order and takes the first match, and core's `@` also matches `@/admin/...`,
 * so `@/admin` comes first.
 */
import { fileURLToPath } from 'node:url';
import { coreAliases } from '../../../astromech/tests/_support/vitest-aliases';

function fromAdmin(path: string): string {
    return fileURLToPath(new URL(`../../${path}`, import.meta.url));
}

export function adminTestAliases(): Record<string, string> {
    return {
        'virtual:astromech/admin-config': fromAdmin(
            'tests/_support/admin-config-shim.ts'
        ),
        'virtual:astromech/admin-icons': fromAdmin('tests/_support/admin-icons-shim.ts'),
        'virtual:astromech/plugins/components': fromAdmin(
            'tests/_support/plugins-components-shim.ts'
        ),
        '@/admin': fromAdmin('src'),
        ...coreAliases(),
    };
}
