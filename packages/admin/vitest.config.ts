import { fileURLToPath } from 'node:url';
import { defaultExclude, defineConfig } from 'vitest/config';
import { coreAliases } from '../astromech/tests/_support/vitest-aliases';
import { isolatedTests } from './tests/_support/isolated-tests';

function fromHere(path: string): string {
    return fileURLToPath(new URL(path, import.meta.url));
}

// Core's aliases resolve core, the schema engine and the admin's published
// subpaths to source, and map `@tests` to core's shared test support. The admin
// adds its own `src` as `@/admin`, and shims for the two virtual modules core's
// Astro integration injects in a site. Vite tries aliases in order and takes the
// first match, and core's `@` also matches `@/admin/...`, so `@/admin` comes
// first.
const alias = {
    'virtual:astromech/admin-config': fromHere('./tests/_support/admin-config-shim.ts'),
    'virtual:astromech/plugins/components': fromHere(
        './tests/_support/plugins-components-shim.ts'
    ),
    '@/admin': fromHere('./src'),
    ...coreAliases(),
};

const include = ['tests/**/*.test.ts', 'tests/**/*.test.tsx'];

// Runs before every test file, and only acts in a happy-dom one.
const setupFiles = ['tests/_support/dom-setup.ts'];

// Worker threads start faster than child processes and share the transform
// cache, and nothing here needs a process of its own.
const pool = 'threads';

const projects = [
    {
        resolve: { alias },
        test: {
            name: 'admin',
            environment: 'node',
            pool,
            // One module graph per worker instead of one per file.
            // `isolatedTests` names the files that cannot live with it.
            isolate: false,
            include,
            setupFiles,
            exclude: [...defaultExclude, ...isolatedTests],
        },
    },
    {
        resolve: { alias },
        test: {
            name: 'admin-isolated',
            environment: 'node',
            pool,
            include: isolatedTests,
            setupFiles,
        },
    },
];

export default defineConfig({
    test: {
        projects,
        // Shared by both projects. Reports go to `coverage/`, which git ignores.
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['src/**/*.d.ts', 'src/**/*.gen.ts'],
            reporter: ['text-summary', 'json-summary'],
            // One entry per top-level directory of src/ that holds TypeScript,
            // plus the files at its root, each set one point below what it
            // measured. Raise an entry as coverage rises; never lower one to
            // pass. The root files measure low: only `src/vite.ts` is tested
            // here, and the rest boot the app in the browser.
            thresholds: {
                'src/*.{ts,tsx}': { lines: 7, functions: 13, branches: 0, statements: 7 },
                'src/components/**': {
                    lines: 45,
                    functions: 42,
                    branches: 42,
                    statements: 44,
                },
                'src/context/**': {
                    lines: 60,
                    functions: 59,
                    branches: 58,
                    statements: 60,
                },
                'src/exports/**': {
                    lines: 99,
                    functions: 99,
                    branches: 99,
                    statements: 99,
                },
                'src/hooks/**': {
                    lines: 47,
                    functions: 42,
                    branches: 37,
                    statements: 46,
                },
                'src/i18n/**': { lines: 91, functions: 99, branches: 65, statements: 92 },
                'src/pages/**': { lines: 7, functions: 5, branches: 4, statements: 7 },
                'src/rendering/**': {
                    lines: 58,
                    functions: 43,
                    branches: 50,
                    statements: 55,
                },
                'src/types/**': {
                    lines: 99,
                    functions: 99,
                    branches: 99,
                    statements: 99,
                },
                'src/utilities/**': {
                    lines: 56,
                    functions: 71,
                    branches: 40,
                    statements: 54,
                },
            },
        },
    },
});
