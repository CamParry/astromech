/**
 * The vitest config every first-party plugin uses.
 *
 * The aliases resolve core to its source, so the plugin's own code and its
 * tests share one module graph. Plugins keep vitest's default per-file
 * isolation, so there is no isolated list here.
 */
import type { ViteUserConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { coreAliases } from './vitest-aliases';
import { assertNoArgumentsAfterDoubleDash } from './vitest-base-config';

export function pluginVitestConfig(): ViteUserConfig {
    assertNoArgumentsAfterDoubleDash();
    return {
        resolve: { alias: coreAliases() },
        test: {
            environment: 'node',
            include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
            // A random order, as in core's config. Vitest prints the seed as the
            // run starts; `--sequence.seed=<n>` replays that order.
            sequence: { shuffle: true },
            // Undoes every `vi.spyOn` before the next test, as core's config does.
            restoreMocks: true,
            // Makes the run's temp directory for `harness.ts`'s test databases
            // and removes it at the end.
            globalSetup: [fileURLToPath(new URL('./global-setup.ts', import.meta.url))],
            // Fails a test on console output it did not declare with `expectConsole`.
            setupFiles: [fileURLToPath(new URL('./console-guard.ts', import.meta.url))],
        },
    };
}
