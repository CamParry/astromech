import { defineConfig } from 'vitest/config';

// A copy of `assertNoArgumentsAfterDoubleDash` in
// `packages/astromech/tests/_support/vitest-base-config.ts`. The schema engine
// sits below core and is published on its own, so its tests do not reach into
// core's test support. Vitest ignores the arguments after a bare `--`, which
// pnpm keeps, so `test:run -- <path>` would run the whole suite.
const doubleDash = process.argv.indexOf('--');
const ignored = doubleDash === -1 ? '' : process.argv.slice(doubleDash + 1).join(' ');
if (ignored !== '') {
    throw new Error(
        `Vitest ignores the arguments after \`--\` (${ignored}) and would run the whole ` +
            `suite. pnpm passes \`--\` on to the script, so leave it out: ` +
            `\`pnpm -F @astromech/schema-engine test:run ${ignored}\`.`
    );
}

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
    },
});
