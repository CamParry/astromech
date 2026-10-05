import { defineConfig } from 'vitest/config';
import {
    cpuLimitsApply,
    relaunchTestRunAtLowerPriority,
    TEST_WORKERS,
} from '../../scripts/cpu-limits.mjs';

// The schema engine sits below core and is published on its own, so its tests
// do not reach into core's test support. This config copies what
// `packages/astromech/tests/_support/vitest-base-config.ts` sets for every
// other package; keep the two in step. It leaves out the console guard, which
// lives in core's test support: nothing in the schema engine logs.

// Vitest ignores the arguments after a bare `--`, which pnpm keeps, so
// `test:run -- <path>` would run the whole suite.
const doubleDash = process.argv.indexOf('--');
const ignored = doubleDash === -1 ? '' : process.argv.slice(doubleDash + 1).join(' ');
if (ignored !== '') {
    throw new Error(
        `Vitest ignores the arguments after \`--\` (${ignored}) and would run the whole ` +
            `suite. pnpm passes \`--\` on to the script, so leave it out: ` +
            `\`pnpm -F @astromech/schema-engine test:run ${ignored}\`.`
    );
}

// A run started with the vitest command relaunches at a lower priority.
relaunchTestRunAtLowerPriority();

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        expect: { requireAssertions: true },
        allowOnly: false,
        testTimeout: 15_000,
        hookTimeout: 10_000,
        restoreMocks: true,
        sequence: { shuffle: true },
        ...(cpuLimitsApply ? { maxWorkers: TEST_WORKERS } : {}),
        // Reports go to `coverage/`, which git ignores.
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.d.ts'],
            reporter: ['text-summary', 'json-summary'],
            // src/ has no directories, so one entry per file, each set one
            // point below what it measured. Raise an entry as coverage rises;
            // never lower one to pass.
            thresholds: {
                'src/apply.ts': {
                    lines: 99,
                    functions: 99,
                    branches: 84,
                    statements: 99,
                },
                'src/ddl.ts': { lines: 99, functions: 99, branches: 99, statements: 99 },
                'src/diff.ts': { lines: 99, functions: 99, branches: 96, statements: 97 },
                'src/generate.ts': {
                    lines: 95,
                    functions: 99,
                    branches: 83,
                    statements: 93,
                },
                'src/identifiers.ts': {
                    lines: 99,
                    functions: 99,
                    branches: 99,
                    statements: 99,
                },
                'src/index.ts': {
                    lines: 99,
                    functions: 99,
                    branches: 99,
                    statements: 99,
                },
                'src/model.ts': {
                    lines: 99,
                    functions: 99,
                    branches: 99,
                    statements: 99,
                },
                'src/oracle.ts': {
                    lines: 99,
                    functions: 99,
                    branches: 99,
                    statements: 99,
                },
                'src/render.ts': {
                    lines: 99,
                    functions: 99,
                    branches: 99,
                    statements: 99,
                },
            },
        },
    },
});
