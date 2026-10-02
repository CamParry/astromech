/**
 * The checks every first-party plugin passes, written once. Each plugin's
 * `tests/contract.test.ts` calls `describePluginContract` with its definition,
 * because core's tests cannot import a plugin: the dependency runs the other way.
 */

import type { AstromechPluginServices, PluginDefinition } from '@/types/index';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTestDb } from '@tests/harness';
import { servedDocument } from '@tests/openapi';
import { missingFromOptimizeDeps } from '@tests/runtime-imports';
import { methodInputs, openInputObjects } from '@tests/strict-input';
import { beforeEach, describe, expect, it } from 'vitest';

/** Where the first-party plugin packages live. */
const PLUGINS_DIR = fileURLToPath(new URL('../../../plugins/', import.meta.url));

/**
 * Register the contract's cases for the plugin whose service key is `key`.
 * `packageUrl` is the plugin package's root, which holds its `src/admin`.
 */
export function describePluginContract(
    key: keyof AstromechPluginServices & string,
    definition: PluginDefinition,
    packageUrl: URL
): void {
    const methods = Object.keys(definition.service ?? {});

    describe(`the ${key} plugin contract`, () => {
        beforeEach(async () => {
            await createTestDb();
        });

        it('refuses unknown keys in every method input, at every depth', () => {
            const inputs = methodInputs(definition.service ?? {});

            expect(Object.keys(inputs).length).toBeGreaterThan(0);
            expect(openInputObjects(inputs)).toEqual([]);
        });

        it('documents every method in the OpenAPI document without a warning', () => {
            const { document, warnings } = servedDocument([definition]);
            const documented = methods.filter(
                (method) =>
                    document.paths[`/plugins/${key}/${method}`]?.['post'] !== undefined
            );

            expect(documented).toEqual(methods);
            expect(warnings).toEqual([]);
        });

        it('lists every package its admin components import in optimizeDeps', () => {
            const adminDir = fileURLToPath(new URL('src/admin', packageUrl));
            const missing = existsSync(adminDir)
                ? missingFromOptimizeDeps(
                      definition.admin?.optimizeDeps?.include,
                      adminDir
                  )
                : [];

            expect(missing).toEqual([]);
        });

        it('is run by every first-party plugin', () => {
            const plugins = readdirSync(PLUGINS_DIR, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name);

            expect(
                plugins.filter(
                    (plugin) =>
                        !existsSync(`${PLUGINS_DIR}${plugin}/tests/contract.test.ts`)
                )
            ).toEqual([]);
        });
    });
}
