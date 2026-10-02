/**
 * The vitest config every first-party plugin uses.
 *
 * The aliases resolve core to its source, so the plugin's own code and its
 * tests share one module graph. Plugins keep vitest's default per-file
 * isolation, so there is no isolated list here: turning it off saves no time,
 * and the assistant, backups and forms suites mock modules or set globals,
 * which would need one.
 *
 * A plugin that tests its admin pages passes `{ adminPages: true }`. The
 * `.test.tsx` files under its `tests/admin/` then run in a second project set
 * up as the admin's own tests are: happy-dom, the admin's `@/admin` alias, its
 * shims for the three virtual modules a site's Vite serves, and its
 * `dom-setup.ts` (English strings, the unmocked-request guard, cleanup). They
 * render through `renderPluginPage` in
 * `packages/admin/tests/_support/render-admin.tsx`. Every other test file runs
 * as it does without the option.
 */
import type { TestProjectInlineConfiguration, ViteUserConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { defaultExclude } from 'vitest/config';
import { adminTestAliases } from '../../../admin/tests/_support/vitest-aliases';
import { coreAliases } from './vitest-aliases';
import {
    assertNoArgumentsAfterDoubleDash,
    baseRootTestOptions,
    baseTestOptions,
} from './vitest-base-config';

export type PluginVitestOptions = {
    /** Run the `.test.tsx` files under `tests/admin/` as admin page tests. */
    adminPages?: boolean;
};

const include = ['tests/**/*.test.ts', 'tests/**/*.test.tsx'];

const adminPageTests = ['tests/admin/**/*.test.tsx'];

// Worker threads, as in core and the admin: about 13% faster than child
// processes over the six plugin suites.
const pool = 'threads';

/** A path in the admin package, which owns the DOM setup. */
function fromAdmin(path: string): string {
    return fileURLToPath(new URL(`../../../admin/${path}`, import.meta.url));
}

export function pluginVitestConfig(options: PluginVitestOptions = {}): ViteUserConfig {
    assertNoArgumentsAfterDoubleDash();
    const nodeTest = {
        ...baseTestOptions,
        environment: 'node',
        pool,
        include,
        // Makes the run's temp directory for `harness.ts`'s test databases
        // and removes it at the end.
        globalSetup: [fileURLToPath(new URL('./global-setup.ts', import.meta.url))],
    };
    if (options.adminPages !== true) {
        return {
            resolve: { alias: coreAliases() },
            test: { ...baseRootTestOptions, ...nodeTest },
        };
    }

    const nodeProject: TestProjectInlineConfiguration = {
        resolve: { alias: coreAliases() },
        test: {
            ...nodeTest,
            name: 'node',
            exclude: [...defaultExclude, ...adminPageTests],
        },
    };
    // Set up as `packages/admin/vitest.config.ts` is: the same aliases, and
    // the admin's DOM setup. Page tests use no database, so this project has
    // no `globalSetup`.
    const adminPagesProject: TestProjectInlineConfiguration = {
        resolve: { alias: adminTestAliases() },
        test: {
            ...baseTestOptions,
            name: 'admin-pages',
            environment: 'happy-dom',
            pool,
            include: adminPageTests,
            setupFiles: [
                ...baseTestOptions.setupFiles,
                fromAdmin('tests/_support/dom-setup.ts'),
            ],
        },
    };
    return {
        test: { ...baseRootTestOptions, projects: [nodeProject, adminPagesProject] },
    };
}
