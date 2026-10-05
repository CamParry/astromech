/**
 * The vitest settings every package's config shares: core, the admin and the
 * plugins (through `plugin-vitest-config.ts`). `packages/schema-engine` keeps a
 * copy in its own config, because it sits below core and is published on its
 * own, so its tests do not reach into core's test support.
 *
 * Pool, isolation, environment and `globalSetup` stay in each package's config,
 * because they follow from what its tests need.
 */
import type { TestUserConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { cpuLimitsApply, TEST_WORKERS } from '../../../../scripts/cpu-limits.mjs';

// Each config calls this as it loads: a run started with the vitest command
// relaunches at a lower priority.
export { relaunchTestRunAtLowerPriority } from '../../../../scripts/cpu-limits.mjs';

/**
 * Options each project spreads into its own `test`. An inline project does not
 * inherit the root config's `test`, so core and the admin spread these into
 * every project.
 */
export const baseTestOptions = {
    // A test that asserts nothing passes whatever the code does. A type-only
    // test lives in a `*.test-d.ts` file, which `typecheck` compiles and
    // vitest does not run.
    expect: { requireAssertions: true },
    // Vitest allows `.only` outside CI, where it silently narrows a run.
    allowOnly: false,
    // A healthy test takes well under a second alone, and several seconds
    // under coverage on a loaded machine: an admin test that types into a form
    // takes over 5 s, vitest's default, at a load average of 25. 15 s allows
    // for that and still stops a hung test. A test that measures its own speed
    // asserts its own time limit rather than leaning on this one.
    testTimeout: 15_000,
    // Vitest's default.
    hookTimeout: 10_000,
    // Undoes every `vi.spyOn` before the next test. Needed most where a worker
    // shares one module graph between files (`isolate: false`), where a spy
    // would otherwise outlive its file.
    restoreMocks: true,
    // Fails a test on console output it did not declare with `expectConsole`.
    setupFiles: [fileURLToPath(new URL('./console-guard.ts', import.meta.url))],
} satisfies TestUserConfig;

/**
 * Options vitest reads only from the root config, whatever a project sets.
 */
export const baseRootTestOptions = {
    // Files and tests run in a random order, so a test that leans on another's
    // leftovers fails. Vitest prints the seed as the run starts;
    // `--sequence.seed=<n>` replays that order.
    sequence: { shuffle: true },
    // Fewer workers on a laptop, so a run leaves it usable.
    ...(cpuLimitsApply ? { maxWorkers: TEST_WORKERS } : {}),
} satisfies TestUserConfig;

/**
 * Throws when the command line passes arguments after a bare `--`.
 *
 * Vitest's CLI parser (cac) moves everything after `--` out of the file
 * filters, so `vitest run -- tests/a.test.ts` runs the whole suite. pnpm keeps
 * the `--` when it runs a script, which makes
 * `pnpm -F <package> test:run -- <path>` that command. Failing here, when the
 * config loads, stops the run before it starts.
 */
export function assertNoArgumentsAfterDoubleDash(): void {
    const index = process.argv.indexOf('--');
    if (index === -1) return;
    const ignored = process.argv.slice(index + 1).join(' ');
    if (ignored === '') return;
    throw new Error(
        `Vitest ignores the arguments after \`--\` (${ignored}) and would run the whole ` +
            `suite. pnpm passes \`--\` on to the script, so leave it out: ` +
            `\`pnpm -F <package> test:run ${ignored}\`.`
    );
}
