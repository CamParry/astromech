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

export default defineConfig({ test: { projects } });
