import { defaultExclude, defineConfig } from 'vitest/config';
import { isolatedTests } from './tests/_support/isolated-tests';
import { coreAliases } from './tests/_support/vitest-aliases';
import {
    assertNoArgumentsAfterDoubleDash,
    baseRootTestOptions,
    baseTestOptions,
} from './tests/_support/vitest-base-config';

assertNoArgumentsAfterDoubleDash();

const alias = coreAliases();

const include = ['tests/**/*.test.ts', 'tests/**/*.test.tsx'];

// Makes the run's temp directory for test databases and removes it at the end.
const globalSetup = ['tests/_support/global-setup.ts'];

// Points `os.tmpdir()` inside that directory, so the teardown sees a temp file
// a test left behind.
const setupFiles = [...baseTestOptions.setupFiles, 'tests/_support/tmpdir-setup.ts'];

// Worker threads start faster than child processes and share the transform
// cache. Only `wranglerTests` need a process of their own.
const pool = 'threads';

// The files that start wrangler's local emulation in process. Each makes a
// wrangler project of its own its working directory (`tests/_support/wrangler.ts`),
// so no two share wrangler's state, and a worker thread cannot change its
// working directory.
const wranglerTests = [
    'tests/integrations/cloudflare/d1-local-emulation.test.ts',
    'tests/storage/drivers/contract.test.ts',
];

const projects = [
    {
        resolve: { alias },
        test: {
            ...baseTestOptions,
            name: 'core',
            environment: 'node',
            pool,
            globalSetup,
            setupFiles,
            // One module graph per worker instead of one per file, which
            // is where the speed-up comes from. `isolatedTests` names the
            // files that cannot live with it.
            isolate: false,
            include,
            exclude: [...defaultExclude, ...isolatedTests, ...wranglerTests],
        },
    },
    {
        resolve: { alias },
        test: {
            ...baseTestOptions,
            name: 'core-isolated',
            environment: 'node',
            pool,
            globalSetup,
            setupFiles,
            include: isolatedTests,
        },
    },
    {
        resolve: { alias },
        test: {
            ...baseTestOptions,
            name: 'core-wrangler',
            environment: 'node',
            // A child process per file, which `process.chdir()` can move.
            pool: 'forks',
            globalSetup,
            setupFiles,
            include: wranglerTests,
        },
    },
];

export default defineConfig({
    test: {
        ...baseRootTestOptions,
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
                    lines: 97,
                    functions: 92,
                    branches: 87,
                    statements: 95,
                },
                'src/ai/**': { lines: 99, functions: 99, branches: 84, statements: 99 },
                'src/app-context/**': {
                    lines: 88,
                    functions: 85,
                    branches: 70,
                    statements: 89,
                },
                'src/auth/**': { lines: 99, functions: 99, branches: 93, statements: 97 },
                'src/codegen/**': {
                    lines: 98,
                    functions: 99,
                    branches: 93,
                    statements: 97,
                },
                'src/config/**': {
                    lines: 99,
                    functions: 99,
                    branches: 96,
                    statements: 99,
                },
                'src/content/**': {
                    lines: 99,
                    functions: 99,
                    branches: 93,
                    statements: 98,
                },
                'src/cron/**': { lines: 89, functions: 94, branches: 71, statements: 89 },
                'src/database/**': {
                    lines: 92,
                    functions: 92,
                    branches: 81,
                    statements: 90,
                },
                'src/email/**': {
                    lines: 43,
                    functions: 45,
                    branches: 32,
                    statements: 43,
                },
                'src/entries/**': {
                    lines: 97,
                    functions: 98,
                    branches: 86,
                    statements: 95,
                },
                'src/errors/**': {
                    lines: 98,
                    functions: 99,
                    branches: 91,
                    statements: 98,
                },
                'src/exports/**': {
                    lines: 99,
                    functions: 99,
                    branches: 99,
                    statements: 99,
                },
                'src/fields/**': {
                    lines: 95,
                    functions: 87,
                    branches: 92,
                    statements: 94,
                },
                'src/globals/**': {
                    lines: 99,
                    functions: 99,
                    branches: 94,
                    statements: 98,
                },
                'src/hooks/**': {
                    lines: 99,
                    functions: 99,
                    branches: 99,
                    statements: 99,
                },
                'src/integrations/**': {
                    lines: 85,
                    functions: 84,
                    branches: 80,
                    statements: 85,
                },
                'src/media/**': {
                    lines: 93,
                    functions: 97,
                    branches: 86,
                    statements: 90,
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
                    branches: 94,
                    statements: 97,
                },
                'src/plugins/**': {
                    lines: 92,
                    functions: 88,
                    branches: 82,
                    statements: 89,
                },
                'src/policies/**': {
                    lines: 98,
                    functions: 99,
                    branches: 96,
                    statements: 97,
                },
                'src/request-scope/**': {
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
                'src/storage/**': {
                    lines: 96,
                    functions: 92,
                    branches: 86,
                    statements: 94,
                },
                'src/transport/**': {
                    lines: 87,
                    functions: 78,
                    branches: 82,
                    statements: 85,
                },
                'src/types/**': {
                    lines: 99,
                    functions: 99,
                    branches: 99,
                    statements: 99,
                },
                'src/users/**': {
                    lines: 99,
                    functions: 99,
                    branches: 92,
                    statements: 98,
                },
                'src/utilities/**': {
                    lines: 99,
                    functions: 99,
                    branches: 97,
                    statements: 99,
                },
            },
        },
    },
});
