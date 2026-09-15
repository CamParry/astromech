/**
 * `createViteConfig()` with the admin's share merged in: the aliases, the `@/`
 * resolver scoped to core's `src`, the base-path define, the virtual modules,
 * the plugins' pre-bundled packages, and that each resolves from the site root.
 */
import type {
    CoreSourceAliasPlugin,
    ResolveContext,
} from '@/integrations/astro/core-source-alias';
import type { VirtualModulePlugin } from '@/integrations/astro/virtual-module';
import type { AdminConfig } from '@/types/config';
import type { PluginDefinition } from '@/types/index';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdminViteConfig } from '@astromech/admin/vite';
import { makeTestConfig } from '@tests/harness';
import { describe, expect, it } from 'vitest';
import { buildAdminConfig } from '@/config/admin-config';
import { resolveConfig } from '@/config/resolve';
import { collectIconNames, createViteConfig } from '@/integrations/astro/vite';

type ViteConfig = ReturnType<typeof createViteConfig>;

type ResolveCall = Parameters<ResolveContext['resolve']>;

const packageSource = fileURLToPath(new URL('../../../src', import.meta.url));
// The demo stands in for a site: it depends on `astromech`, not on the admin.
const siteRoot = fileURLToPath(new URL('../../../../../apps/demo', import.meta.url));

describe('createViteConfig()', () => {
    const config = { ...makeTestConfig(), basePath: '/admin' };
    const resolvedConfig = resolveConfig(config);
    const vite = createViteConfig({
        packageSource,
        admin: createAdminViteConfig(),
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

    // Vite's own matching rule (`moduleListContains`): an excluded name also
    // covers its subpaths, and it is checked against the specifier as written,
    // before the alias replaces it.
    it('keeps core and the admin out of pre-bundling, aliased entries included', () => {
        const exclude = vite.optimizeDeps?.exclude ?? [];
        const alias = vite.resolve?.alias as Record<string, string>;
        const packageEntries = Object.keys(alias).filter(
            (id) => id.startsWith('astromech/') || id.startsWith('@astromech/admin')
        );
        const bundled = packageEntries.filter(
            (id) => !exclude.some((name) => id === name || id.startsWith(`${name}/`))
        );

        expect(exclude).toEqual(
            expect.arrayContaining(['astromech', '@astromech/admin'])
        );
        expect(packageEntries).toEqual(
            expect.arrayContaining(['astromech/shared', 'astromech/fetch'])
        );
        expect(bundled).toEqual([]);
    });

    it('resolves every pre-bundled package from the site root through packages that declare it', () => {
        const include = (vite.optimizeDeps?.include ?? []).filter(
            (entry) => entry !== undefined
        );
        const problems = include
            .map((entry) => findChainProblem(entry, siteRoot))
            .filter((problem) => problem !== undefined);

        expect(include).not.toHaveLength(0);
        expect(problems).toEqual([]);
    });

    describe('plugin optimizeDeps', () => {
        it("names a published plugin's packages through the plugin package", () => {
            expect(includeWith([charts()])).toContain('@acme/charts > chart.js');
        });

        it("names a plugin with a file: root's packages bare, as the site resolves them", () => {
            const include = includeWith([
                charts('file:///site/src/plugins/charts/index.ts'),
            ]);

            expect(include).toContain('chart.js');
            expect(include).not.toContain('@acme/charts > chart.js');
        });

        it('lists each entry once', () => {
            const include = includeWith([
                charts('file:///site/src/plugins/charts/index.ts', ['chart.js', 'react']),
                {
                    ...charts('file:///site/src/plugins/graphs/index.ts'),
                    package: 'graphs',
                },
            ]);

            expect(include.filter((entry) => entry === 'chart.js')).toHaveLength(1);
            expect(include.filter((entry) => entry === 'react')).toHaveLength(1);
        });
    });

    describe('astromech:core-source-alias', () => {
        it('resolves an @/ import from a file inside core src against core src', async () => {
            const importer = packageSource + '/exports/shared.ts';
            const { result, calls } = await resolveCoreSourceAlias(
                vite,
                '@/entries/entry-url',
                importer
            );

            expect(result).toEqual({ id: packageSource + '/entries/entry-url' });
            expect(calls).toEqual([
                [
                    packageSource + '/entries/entry-url',
                    importer,
                    expect.objectContaining({ skipSelf: true }),
                ],
            ]);
        });

        it('leaves an @/ import from a site file to the site', async () => {
            const { result, calls } = await resolveCoreSourceAlias(
                vite,
                '@/entries/entry-url',
                '/site/src/pages/index.astro'
            );

            expect(result).toBeNull();
            expect(calls).toEqual([]);
        });

        it('ignores an id that does not start with @/', async () => {
            const { result, calls } = await resolveCoreSourceAlias(
                vite,
                'astromech/shared',
                packageSource + '/exports/fetch.ts'
            );

            expect(result).toBeNull();
            expect(calls).toEqual([]);
        });

        it('resolves from a core importer that carries a query string', async () => {
            const importer = packageSource + '/exports/shared.ts?v=abc123';
            const { result, calls } = await resolveCoreSourceAlias(
                vite,
                '@/entries/entry-url',
                importer
            );

            expect(result).toEqual({ id: packageSource + '/entries/entry-url' });
            expect(calls).toHaveLength(1);
        });
    });
});

describe('collectIconNames()', () => {
    it('collects every icon name in the admin config, deduped and sorted', () => {
        const adminConfig = {
            entries: { post: { icon: 'Newspaper' }, page: { icon: 'FileText' } },
            globals: { site: { icon: 'Globe' } },
            plugins: [{ nav: [{ icon: 'Star', children: [{ icon: 'FileText' }] }] }],
            pages: [{ icon: 'ChartBar' }],
        } as unknown as AdminConfig;

        expect(collectIconNames(adminConfig)).toEqual([
            'ChartBar',
            'FileText',
            'Globe',
            'Newspaper',
            'Star',
        ]);
    });
});

/** A plugin whose admin components import `include`, with `root` if given. */
function charts(root?: string, include = ['chart.js']): PluginDefinition {
    return {
        package: '@acme/charts',
        ...(root !== undefined ? { root } : {}),
        admin: { optimizeDeps: { include } },
    };
}

/** The `optimizeDeps.include` of a site that installs `plugins`. */
function includeWith(plugins: PluginDefinition[]): string[] {
    const config = { ...makeTestConfig(), plugins };
    const vite = createViteConfig({
        packageSource,
        admin: createAdminViteConfig(),
        root: new URL('file:///site/'),
        configFile: './site.config.ts',
        config,
        resolvedConfig: resolveConfig(config),
    });
    return (vite.optimizeDeps?.include ?? []).filter((entry) => entry !== undefined);
}

function loadVirtualModule(vite: ViteConfig, id: string): string | undefined {
    const plugin = findPlugin<VirtualModulePlugin>(vite, id);
    const resolvedId = plugin.resolveId(id);
    return resolvedId === undefined ? undefined : plugin.load(resolvedId);
}

/** Call the core source alias with a fake context that records each `resolve` call. */
async function resolveCoreSourceAlias(vite: ViteConfig, id: string, importer: string) {
    const plugin = findPlugin<CoreSourceAliasPlugin>(vite, 'astromech:core-source-alias');
    const calls: ResolveCall[] = [];
    const context: ResolveContext = {
        resolve: (...args) => {
            calls.push(args);
            return Promise.resolve({ id: args[0] });
        },
    };
    const result = await plugin.resolveId.call(context, id, importer, {
        isEntry: false,
        attributes: {},
    });
    return { result, calls };
}

function findPlugin<T extends { name: string }>(vite: ViteConfig, name: string): T {
    const plugin = ((vite.plugins ?? []) as unknown[])
        .flat(Infinity)
        .find(
            (candidate): candidate is T =>
                typeof candidate === 'object' &&
                candidate !== null &&
                'name' in candidate &&
                candidate.name === name
        );
    if (plugin === undefined) throw new Error(`No Vite plugin named ${name}`);
    return plugin;
}

/** `react/jsx-runtime` is the `react` package; `@scope/name/sub` is `@scope/name`. */
function packageNameOf(specifier: string): string {
    return specifier
        .split('/')
        .slice(0, specifier.startsWith('@') ? 2 : 1)
        .join('/');
}

/**
 * Walk an `optimizeDeps.include` entry as Vite does, finding each package in
 * `a > b > c` from the one before it. Each must be declared by that package,
 * since pnpm links nothing undeclared, and must resolve there.
 */
function findChainProblem(entry: string, root: string): string | undefined {
    let dir = root;
    for (const name of entry.split('>').map((part) => packageNameOf(part.trim()))) {
        const manifest = readManifest(dir);
        const declared = { ...manifest.dependencies, ...manifest.peerDependencies };
        if (!(name in declared)) {
            return `${entry}: ${name} is not a dependency of ${manifest.name}`;
        }
        const found = resolvePackageDir(name, dir);
        if (found === undefined) {
            return `${entry}: ${name} does not resolve from ${manifest.name}`;
        }
        dir = found;
    }
    return undefined;
}

type Manifest = {
    name: string;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
};

function readManifest(dir: string): Manifest {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest;
}

/** The real path of package `name` as Node's lookup finds it from `dir`. */
function resolvePackageDir(name: string, dir: string): string | undefined {
    const lookup = createRequire(join(dir, 'package.json')).resolve.paths(name) ?? [];
    const found = lookup
        .map((nodeModules) => join(nodeModules, name))
        .find((candidate) => existsSync(join(candidate, 'package.json')));
    return found === undefined ? undefined : realpathSync(found);
}
