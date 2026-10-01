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
import {
    assertNoArgumentsAfterDoubleDash,
    baseRootTestOptions,
    baseTestOptions,
} from './vitest-base-config';

export function pluginVitestConfig(): ViteUserConfig {
    assertNoArgumentsAfterDoubleDash();
    return {
        resolve: { alias: coreAliases() },
        test: {
            ...baseRootTestOptions,
            ...baseTestOptions,
            environment: 'node',
            include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
            // Makes the run's temp directory for `harness.ts`'s test databases
            // and removes it at the end.
            globalSetup: [fileURLToPath(new URL('./global-setup.ts', import.meta.url))],
        },
    };
}
