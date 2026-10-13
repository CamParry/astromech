/**
 * `astromech()`, the Astro integration: its two config hooks, driven with
 * recording fakes against a temp project root.
 */
import type { DB } from '@/database/types';
import type { VirtualModulePlugin } from '@/integrations/astro/virtual-module';
import type { HookParameters } from 'astro';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { createTempSite, runOk, writeSiteConfig } from '@tests/cli';
import { findMissingExportTargets } from '@tests/package-exports';
import { Kysely, sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AstromechError } from '@/errors/astromech-error';
import { astromech } from '@/integrations/astro/integration';
import dbGenerate from '@/transport/cli/commands/db-generate';

type Recorded = {
    updateConfig: { vite: ViteUpdate }[];
    injectRoute: { pattern: string; entrypoint: string; prerender: boolean }[];
    addMiddleware: { entrypoint: string; order: string }[];
    injectTypes: { filename: string; content: string }[];
    infos: string[];
    warnings: string[];
    errors: string[];
};

type ViteUpdate = {
    resolve: { alias: Record<string, string> };
    define: Record<string, string>;
    plugins: unknown[];
};

/** Astro's `security.allowedDomains`, as a site writes it. */
type AllowedDomains = { hostname?: string; protocol?: string; port?: string }[];

/** Astro's `security.csp`, as a site writes it. */
type Csp = boolean | { scriptDirective?: { resources?: string[] } };

// No imports, so jiti can load it from a directory outside the package.
const configSource = `
const unused = () => {
    throw new Error('not used by the config hooks');
};

export default {
    basePath: '/admin',
    db: { name: 'test', getInstance: unused },
    storage: {
        name: 'test-noop',
        put: async () => undefined,
        get: async () => null,
        stat: async () => null,
        delete: async () => undefined,
        list: async () => ({ keys: [] }),
        getPublicUrl: (key: string) => '/' + key,
    },
    entries: [
        {
            type: 'post',
            single: 'Post',
            plural: 'Posts',
            fields: [{ name: 'body', type: 'text', label: 'Body' }],
        },
    ],
};
`;

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'astromech-integration-'));
    await writeFile(join(root, 'astromech.config.ts'), configSource);
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe('astromech()', () => {
    it('throws AstromechError from astro:config:done before astro:config:setup has run', async () => {
        const { done } = createFakes();

        await expect(
            astromech().hooks['astro:config:done']?.(done)
        ).rejects.toBeInstanceOf(AstromechError);
    });

    describe('astro:config:setup', () => {
        it('hands Astro a Vite config built from the loaded config file', async () => {
            const { recorded } = await runSetup();

            expect(recorded.updateConfig).toHaveLength(1);
            const vite = recorded.updateConfig[0]?.vite;
            expect(vite?.define.__ASTROMECH_BASE_PATH__).toBe('"/admin"');
        });

        it('injects the media, admin shell and API routes', async () => {
            const { recorded } = await runSetup();

            expect(recorded.injectRoute.map((route) => route.pattern)).toEqual([
                '/_media/[...path]',
                '/admin/[...path]',
                '/admin/api/[...path]',
            ]);
        });

        it('throws when react() comes before astromech()', async () => {
            await expect(
                runSetup([{ name: '@astrojs/react' }, { name: 'astromech' }])
            ).rejects.toThrow(
                "astromech() must come before react() in `integrations`. The admin splits its routes into chunks with the TanStack Router plugin, which has to run before React's transform, and Astro adds Vite plugins in integration order. Use `integrations: [astromech(), react()]`."
            );
        });

        it('accepts astromech() before react(), and a site without react()', async () => {
            await expect(
                runSetup([{ name: 'astromech' }, { name: '@astrojs/react' }])
            ).resolves.toBeDefined();
            await expect(runSetup([{ name: 'astromech' }])).resolves.toBeDefined();
        });

        it('adds astromech/middleware ahead of the site middleware', async () => {
            const { recorded } = await runSetup();

            expect(recorded.addMiddleware).toEqual([
                { entrypoint: 'astromech/middleware', order: 'pre' },
            ]);
            expect(findMissingExportTargets('astromech/middleware')).toEqual([]);
        });
    });

    describe('astro:config:done', () => {
        it('injects astromech.d.ts with the generated types', async () => {
            const { integration, recorded, done } = await runSetup();
            await integration.hooks['astro:config:done']?.(done);

            expect(recorded.injectTypes).toHaveLength(1);
            expect(recorded.injectTypes[0]?.filename).toBe('astromech.d.ts');
            expect(recorded.injectTypes[0]?.content).toContain('post');
        });

        it.each([
            [[], false],
            [[{ hostname: 'example.com' }], true],
        ] satisfies [AllowedDomains, boolean][])(
            'serves astroReadsForwardedFor for security.allowedDomains %j as %s',
            async (allowedDomains, expected) => {
                const { integration, recorded, done } = await runSetup(undefined, {
                    allowedDomains,
                });
                await integration.hooks['astro:config:done']?.(done);

                expect(loadConfigModule(recorded)).toContain(
                    `export const astroReadsForwardedFor = ${String(expected)};`
                );
            }
        );

        it.each([
            [false, false],
            [true, true],
            [{ scriptDirective: { resources: ["'self'"] } }, true],
        ] satisfies [Csp, boolean][])(
            'serves astroSendsCsp for security.csp %j as %s',
            async (csp, expected) => {
                const { integration, recorded, done } = await runSetup(undefined, {
                    csp,
                });
                await integration.hooks['astro:config:done']?.(done);

                expect(loadConfigModule(recorded)).toContain(
                    `export const astroSendsCsp = ${String(expected)};`
                );
            }
        );

        it.each([
            ['dev', 'import.meta.env'],
            ['build', 'undefined'],
        ] as const)('serves viteEnv under astro %s as %s', async (command, expected) => {
            const { integration, recorded, done } = await runSetup(undefined, {
                command,
            });
            await integration.hooks['astro:config:done']?.(done);

            expect(loadConfigModule(recorded)).toContain(
                `export const viteEnv = ${expected};`
            );
        });

        it('does not warn at startup when allowedDomains is set and trustProxy is unset', async () => {
            const { integration, recorded, done } = await runSetup(undefined, {
                allowedDomains: [{ hostname: 'example.com' }],
            });
            await integration.hooks['astro:config:done']?.(done);

            expect(recorded.warnings).toEqual([]);
        });

        it('writes the method manifest into the project .astro directory', async () => {
            const { integration, recorded, done } = await runSetup();
            await integration.hooks['astro:config:done']?.(done);

            const manifest = JSON.parse(
                await readFile(join(root, '.astro', 'astromech.methods.json'), 'utf8')
            ) as { methods: { id: string }[] };
            expect(manifest.methods.map((method) => method.id)).toContain(
                'entries.post.create'
            );
            expect(recorded.warnings).toEqual([]);
        });
    });
    describe('astro:build:start', () => {
        it('applies the migrations before Astro prerenders a page', async () => {
            // A CLI site takes the place of the empty root `beforeEach` made,
            // which goes first so `afterEach` removes the site in its place.
            await rm(root, { recursive: true, force: true });
            root = await createTempSite();
            const database = join(root, 'database.db');
            const configFile = await writeSiteConfig(root, {
                database,
                migrationsDir: join(root, 'migrations'),
            });
            await runOk(dbGenerate, ['--config', configFile]);
            const integration = astromech({ configFile });
            const { setup, logger } = createFakes();
            await integration.hooks['astro:config:setup']?.(setup);

            await integration.hooks['astro:build:start']?.({
                logger,
            } as unknown as HookParameters<'astro:build:start'>);

            const db = new Kysely<DB>({
                dialect: new LibsqlDialect({ url: `file:${database}` }),
            });
            try {
                const { rows } = await sql<{
                    name: string;
                }>`SELECT name FROM kysely_migration`.execute(db);
                expect(rows.map((row) => row.name)).toEqual(['0000_migration']);
            } finally {
                await db.destroy();
            }
        });

        it('reports a site with no migrations yet and applies none', async () => {
            await rm(root, { recursive: true, force: true });
            root = await createTempSite();
            const configFile = await writeSiteConfig(root, {
                database: join(root, 'database.db'),
            });
            const integration = astromech({ configFile });
            const { setup, logger, recorded } = createFakes();
            await integration.hooks['astro:config:setup']?.(setup);

            await integration.hooks['astro:build:start']?.({
                logger,
            } as unknown as HookParameters<'astro:build:start'>);

            expect(recorded.errors).toEqual([
                `${join(root, 'migrations')} has no migrations, so Astromech applied none. ` +
                    'Run `astromech db:generate` and `astromech db:init`.',
            ]);
        });

        it('refuses a config whose migrations are not the chain in migrationsDir', async () => {
            await rm(root, { recursive: true, force: true });
            root = await createTempSite();
            const configFile = await writeSiteConfig(root, {
                database: join(root, 'database.db'),
            });
            await runOk(dbGenerate, ['--config', configFile]);
            // The journal names a migration the imported chain does not have.
            await writeFile(
                join(root, 'migrations', 'journal.json'),
                JSON.stringify({
                    version: 1,
                    dialect: 'sqlite',
                    entries: [{ idx: 0, tag: '0000_other', when: 0 }],
                })
            );
            const integration = astromech({ configFile });
            const { setup, logger } = createFakes();
            await integration.hooks['astro:config:setup']?.(setup);

            await expect(
                integration.hooks['astro:build:start']?.({
                    logger,
                } as unknown as HookParameters<'astro:build:start'>)
            ).rejects.toThrow(
                'Only in `migrations`: 0000_migration. Only in the journal: 0000_other.'
            );
        });
    });

    describe.each(['astro:build:start', 'astro:server:setup'] as const)('%s', (hook) => {
        it('leaves a remote database to db:init --allow-remote', async () => {
            await writeFile(
                join(root, 'astromech.config.ts'),
                configSource.replace(
                    "db: { name: 'test', getInstance: unused },",
                    "db: { name: 'test', getInstance: unused, isRemote: async () => true },"
                )
            );
            const { integration, recorded, logger } = await runSetup();

            // Both hooks read only `logger`.
            await integration.hooks[hook]?.({ logger } as never);

            expect(recorded.infos).toContain(
                'The database is remote, so Astromech did not apply migrations. ' +
                    'Apply them with `astromech db:init --allow-remote`.'
            );
        });
    });
});

async function runSetup(integrations?: { name: string }[], site: Site = {}) {
    const integration = astromech();
    const fakes = createFakes(integrations, site);
    await integration.hooks['astro:config:setup']?.(fakes.setup);
    return { integration, ...fakes };
}

/** The Astro config a fake site sets beyond its integrations. */
type Site = { allowedDomains?: AllowedDomains; csp?: Csp; command?: 'dev' | 'build' };

/** Recording fakes for both hooks, for a site whose integrations are `integrations`. */
function createFakes(
    integrations: { name: string }[] = [{ name: 'astromech' }],
    site: Site = {}
) {
    const recorded: Recorded = {
        updateConfig: [],
        injectRoute: [],
        addMiddleware: [],
        injectTypes: [],
        infos: [],
        warnings: [],
        errors: [],
    };
    const logger = {
        info: (message: string) => recorded.infos.push(message),
        warn: (message: string) => recorded.warnings.push(message),
        error: (message: string) => recorded.errors.push(message),
        debug: () => undefined,
    };
    const config = {
        root: pathToFileURL(`${root}/`),
        integrations,
        security: { allowedDomains: site.allowedDomains ?? [], csp: site.csp ?? false },
    };

    const setup = {
        command: site.command ?? 'build',
        config,
        logger,
        updateConfig: (update: { vite: ViteUpdate }) =>
            recorded.updateConfig.push(update),
        injectRoute: (route: Recorded['injectRoute'][number]) =>
            recorded.injectRoute.push(route),
        addMiddleware: (middleware: Recorded['addMiddleware'][number]) =>
            recorded.addMiddleware.push(middleware),
    } as unknown as HookParameters<'astro:config:setup'>;

    const done = {
        config,
        logger,
        injectTypes: (types: Recorded['injectTypes'][number]) =>
            recorded.injectTypes.push(types),
    } as unknown as HookParameters<'astro:config:done'>;

    return { recorded, setup, done, logger };
}

/** The source the recorded Vite config serves for `virtual:astromech/config`. */
function loadConfigModule(recorded: Recorded): string | undefined {
    const plugin = recorded.updateConfig[0]?.vite.plugins.find(
        (candidate): candidate is VirtualModulePlugin =>
            (candidate as { name?: unknown }).name === 'virtual:astromech/config'
    );
    if (plugin === undefined) throw new Error('no virtual:astromech/config plugin');
    const resolvedId = plugin.resolveId('virtual:astromech/config');
    return resolvedId === undefined ? undefined : plugin.load(resolvedId);
}
