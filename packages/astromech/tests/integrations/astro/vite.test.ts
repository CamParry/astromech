/**
 * `createViteConfig()`: the aliases, the base-path define, the three virtual
 * modules, and that the pre-bundled packages match the workspace hoist list.
 */
import type { VirtualModulePlugin } from '@/integrations/astro/virtual-module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeTestConfig } from '@tests/harness';
import { describe, expect, it } from 'vitest';
import { buildAdminConfig } from '@/config/admin-config';
import { resolveConfig } from '@/config/resolve';
import { createViteConfig } from '@/integrations/astro/vite';

type ViteConfig = ReturnType<typeof createViteConfig>;

const packageSource = fileURLToPath(new URL('../../../src', import.meta.url));
const workspaceFile = fileURLToPath(
    new URL('../../../../../pnpm-workspace.yaml', import.meta.url)
);

// Hoisted so Vite can externalise libsql's native binding, not for the admin.
const serverOnlyHoists = ['libsql', '@libsql/*'];

describe('createViteConfig()', () => {
    const config = { ...makeTestConfig(), basePath: '/admin' };
    const resolvedConfig = resolveConfig(config);
    const vite = createViteConfig({
        packageSource,
        root: new URL('file:///site/'),
        configFile: './site.config.ts',
        config,
        resolvedConfig,
    });

    it('points every alias at a path that exists', () => {
        const alias = vite.resolve?.alias as Record<string, string>;
        const missing = Object.entries(alias)
            .filter(([, target]) => !existsSync(target))
            .map(([key, target]) => `${key} -> ${target}`);

        expect(Object.keys(alias)).not.toHaveLength(0);
        expect(missing).toEqual([]);
    });

    it('defines __ASTROMECH_BASE_PATH__ as the JSON of the resolved basePath', () => {
        expect(vite.define?.__ASTROMECH_BASE_PATH__).toBe(
            JSON.stringify(resolvedConfig.basePath)
        );
        expect(resolvedConfig.basePath).toBe('/admin');
    });

    it('serves virtual:astromech/admin-config as the default export of buildAdminConfig', () => {
        expect(loadVirtualModule(vite, 'virtual:astromech/admin-config')).toBe(
            `export default ${JSON.stringify(buildAdminConfig(config, resolvedConfig))};`
        );
    });

    it('serves virtual:astromech/config as a re-export of the config file', () => {
        expect(loadVirtualModule(vite, 'virtual:astromech/config')).toBe(
            'import rawConfig from "/site/site.config.ts";\nexport { rawConfig };'
        );
    });

    it('serves virtual:astromech/plugins/components as a module', () => {
        const source = loadVirtualModule(vite, 'virtual:astromech/plugins/components');

        for (const name of ['fieldTypes', 'pages', 'hostPages', 'slots', 'i18n']) {
            expect(source).toContain(`export const ${name} = {`);
        }
    });

    it('pre-bundles exactly the packages pnpm-workspace.yaml hoists for the admin', () => {
        const included = new Set(
            (vite.optimizeDeps?.include ?? [])
                .filter((specifier) => specifier !== undefined)
                .map(packageNameOf)
        );
        const hoisted = new Set(
            readPublicHoistPattern().filter((name) => !serverOnlyHoists.includes(name))
        );

        const problems = [
            ...[...included]
                .filter((name) => !hoisted.has(name))
                .map(
                    (name) =>
                        `${name} is in optimizeDeps.include (vite.ts) but missing from publicHoistPattern (pnpm-workspace.yaml)`
                ),
            ...[...hoisted]
                .filter((name) => !included.has(name))
                .map(
                    (name) =>
                        `${name} is in publicHoistPattern (pnpm-workspace.yaml) but missing from optimizeDeps.include (vite.ts)`
                ),
        ];

        expect(included.size).toBeGreaterThan(0);
        expect(problems).toEqual([]);
    });
});

function loadVirtualModule(vite: ViteConfig, id: string): string | undefined {
    const plugin = ((vite.plugins ?? []) as unknown[])
        .flat(Infinity)
        .find(
            (candidate): candidate is VirtualModulePlugin =>
                typeof candidate === 'object' &&
                candidate !== null &&
                'name' in candidate &&
                candidate.name === id
        );
    if (plugin === undefined) throw new Error(`No Vite plugin named ${id}`);
    const resolvedId = plugin.resolveId(id);
    return resolvedId === undefined ? undefined : plugin.load(resolvedId);
}

/** `react/jsx-runtime` is the `react` package; `@scope/name/sub` is `@scope/name`. */
function packageNameOf(specifier: string): string {
    return specifier
        .split('/')
        .slice(0, specifier.startsWith('@') ? 2 : 1)
        .join('/');
}

/** The `publicHoistPattern:` list, read line by line to avoid a YAML dependency. */
function readPublicHoistPattern(): string[] {
    const lines = readFileSync(workspaceFile, 'utf8').split('\n');
    const start = lines.findIndex((line) => line.trim() === 'publicHoistPattern:');
    if (start === -1) throw new Error('pnpm-workspace.yaml has no publicHoistPattern');

    const names: string[] = [];
    for (const line of lines.slice(start + 1)) {
        if (line.trim().startsWith('#')) continue;
        const name = /^\s+-\s+['"]?([^'"\s]+)['"]?\s*$/.exec(line)?.[1];
        if (name === undefined) break;
        names.push(name);
    }
    return names;
}
