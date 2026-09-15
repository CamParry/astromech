import { defaultExclude, defineConfig } from 'vitest/config';
import { isolatedTests } from './tests/_support/isolated-tests';
import { coreAliases } from './tests/_support/vitest-aliases';

const alias = coreAliases();

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

export default defineConfig({
    test: {
        projects,
        // Shared by both projects. Reports go to `coverage/`, which git ignores.
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['src/**/*.d.ts'],
            reporter: ['text-summary', 'json-summary'],
            // One entry per top-level directory of src/, plus the files at its root,
            // each set one point below what it measured. Raise an entry as coverage
            // rises; never lower one to pass.
            thresholds: {
                'src/*.{ts,tsx}': {
                    lines: 91,
                    functions: 89,
                    branches: 75,
                    statements: 90,
                },
                'src/ai/**': { lines: 99, functions: 99, branches: 84, statements: 99 },
                'src/app-context/**': {
                    lines: 88,
                    functions: 83,
                    branches: 56,
                    statements: 89,
                },
                'src/codegen/**': {
                    lines: 95,
                    functions: 97,
                    branches: 83,
                    statements: 93,
                },
                'src/config/**': {
                    lines: 98,
                    functions: 96,
                    branches: 89,
                    statements: 97,
                },
                'src/content/**': {
                    lines: 90,
                    functions: 95,
                    branches: 81,
                    statements: 89,
                },
                'src/cron/**': { lines: 89, functions: 94, branches: 71, statements: 89 },
                'src/database/**': {
                    lines: 78,
                    functions: 84,
                    branches: 72,
                    statements: 78,
                },
                'src/email/**': { lines: 19, functions: 7, branches: 0, statements: 19 },
                'src/entries/**': {
                    lines: 95,
                    functions: 96,
                    branches: 82,
                    statements: 92,
                },
                'src/errors/**': {
                    lines: 94,
                    functions: 99,
                    branches: 86,
                    statements: 94,
                },
                'src/exports/**': {
                    lines: 99,
                    functions: 99,
                    branches: 99,
                    statements: 99,
                },
                'src/fields/**': {
                    lines: 92,
                    functions: 81,
                    branches: 90,
                    statements: 91,
                },
                'src/globals/**': {
                    lines: 96,
                    functions: 91,
                    branches: 93,
                    statements: 96,
                },
                'src/hooks/**': {
                    lines: 89,
                    functions: 74,
                    branches: 74,
                    statements: 90,
                },
                'src/integrations/**': {
                    lines: 77,
                    functions: 75,
                    branches: 68,
                    statements: 77,
                },
                'src/media/**': {
                    lines: 92,
                    functions: 97,
                    branches: 83,
                    statements: 89,
                },
                'src/notifications/**': {
                    lines: 99,
                    functions: 99,
                    branches: 90,
                    statements: 96,
                },
                'src/permissions/**': {
                    lines: 98,
                    functions: 99,
                    branches: 88,
                    statements: 97,
                },
                'src/plugins/**': {
                    lines: 88,
                    functions: 79,
                    branches: 76,
                    statements: 84,
                },
                'src/policies/**': {
                    lines: 96,
                    functions: 99,
                    branches: 93,
                    statements: 94,
                },
                'src/request-context/**': {
                    lines: 99,
                    functions: 99,
                    branches: 99,
                    statements: 99,
                },
                'src/services/**': {
                    lines: 99,
                    functions: 99,
                    branches: 99,
                    statements: 99,
                },
                'src/settings/**': {
                    lines: 99,
                    functions: 99,
                    branches: 94,
                    statements: 99,
                },
                'src/storage/**': {
                    lines: 96,
                    functions: 92,
                    branches: 86,
                    statements: 94,
                },
                'src/transport/**': {
                    lines: 65,
                    functions: 62,
                    branches: 66,
                    statements: 65,
                },
                'src/types/**': {
                    lines: 99,
                    functions: 99,
                    branches: 99,
                    statements: 99,
                },
                'src/users/**': {
                    lines: 92,
                    functions: 96,
                    branches: 84,
                    statements: 91,
                },
                'src/utilities/**': {
                    lines: 60,
                    functions: 40,
                    branches: 76,
                    statements: 62,
                },
            },
        },
    },
});
