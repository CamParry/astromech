import { fileURLToPath } from 'node:url';
import { defaultExclude, defineConfig } from 'vitest/config';
import { isolatedTests } from './tests/_support/isolated-tests';

const alias = {
    // Admin virtual modules, normally injected by the Astro integration.
    'virtual:astromech/admin-config': fileURLToPath(
        new URL('./tests/_support/admin-config-shim.ts', import.meta.url)
    ),
    'virtual:astromech/plugins/components': fileURLToPath(
        new URL('./tests/_support/plugins-components-shim.ts', import.meta.url)
    ),
    '@': fileURLToPath(new URL('./src', import.meta.url)),
    '@tests': fileURLToPath(new URL('./tests/_support', import.meta.url)),
    // First-party plugin packages and the public subpaths they consume
    // resolve to source under vitest (no build step before tests). The
    // subpath aliases MUST precede the bare `astromech` alias so the
    // longest match wins.
    'astromech/fields': fileURLToPath(
        new URL('./src/exports/fields.ts', import.meta.url)
    ),
    'astromech/columns': fileURLToPath(
        new URL('./src/exports/columns.ts', import.meta.url)
    ),
    'astromech/email': fileURLToPath(new URL('./src/exports/email.ts', import.meta.url)),
    // The schema engine resolves to source under vitest (no build step
    // before tests). Subpath alias FIRST — longest match must win.
    '@astromech/schema-engine/generate': fileURLToPath(
        new URL('../schema-engine/src/generate.ts', import.meta.url)
    ),
    '@astromech/schema-engine': fileURLToPath(
        new URL('../schema-engine/src/index.ts', import.meta.url)
    ),
    '@astromech/menus': fileURLToPath(
        new URL('../plugins/menus/src/index.ts', import.meta.url)
    ),
    '@astromech/redirects/tables': fileURLToPath(
        new URL('../plugins/redirects/src/tables/index.ts', import.meta.url)
    ),
    '@astromech/redirects': fileURLToPath(
        new URL('../plugins/redirects/src/index.ts', import.meta.url)
    ),
    // Backups plugin — subpath aliases before the bare package alias.
    '@astromech/backups/tables': fileURLToPath(
        new URL('../plugins/backups/src/tables/index.ts', import.meta.url)
    ),
    '@astromech/backups/internals': fileURLToPath(
        new URL('../plugins/backups/src/backup.ts', import.meta.url)
    ),
    '@astromech/backups': fileURLToPath(
        new URL('../plugins/backups/src/index.ts', import.meta.url)
    ),
    // Forms plugin — no subpath aliases: it publishes only the package
    // root, and its internals are reached by relative path from tests.
    '@astromech/forms': fileURLToPath(
        new URL('../plugins/forms/src/index.ts', import.meta.url)
    ),
    astromech: fileURLToPath(new URL('./src/exports/index.ts', import.meta.url)),
};

const include = ['tests/**/*.test.ts', 'tests/**/*.test.tsx'];

// Worker threads start faster than child processes and share the transform
// cache, and nothing here needs a process of its own.
const pool = 'threads';

const projects = [
    {
        resolve: { alias },
        test: {
            name: 'core',
            environment: 'node',
            pool,
            // One module graph per worker instead of one per file, which
            // is where the speed-up comes from. `isolatedTests` names the
            // files that cannot live with it.
            isolate: false,
            include,
            exclude: [...defaultExclude, ...isolatedTests],
        },
    },
    {
        resolve: { alias },
        test: {
            name: 'core-isolated',
            environment: 'node',
            pool,
            include: isolatedTests,
        },
    },
];

export default defineConfig({ test: { projects } });
