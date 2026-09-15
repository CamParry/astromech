/**
 * `astromech()`, the Astro integration: its two config hooks, driven with
 * recording fakes against a temp project root.
 */
import type { HookParameters } from 'astro';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findMissingExportTargets } from '@tests/package-exports';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AstromechError } from '@/errors/astromech-error';
import { astromech } from '@/integrations/astro/integration';

type Recorded = {
    updateConfig: { vite: ViteUpdate }[];
    injectRoute: { pattern: string; entrypoint: string; prerender: boolean }[];
    addMiddleware: { entrypoint: string; order: string }[];
    injectTypes: { filename: string; content: string }[];
    warnings: string[];
};

type ViteUpdate = {
    resolve: { alias: Record<string, string> };
    define: Record<string, string>;
};

const packageSource = fileURLToPath(new URL('../../../src', import.meta.url));

// No imports, so jiti can load it from a directory outside the package.
const configSource = `
const unused = () => {
    throw new Error('not used by the config hooks');
};

export default {
    basePath: '/admin',
    db: { type: 'test', getInstance: unused, createDialect: unused },
    storage: {
        name: 'test-noop',
        put: async () => undefined,
        get: async () => null,
        stat: async () => null,
        delete: async () => undefined,
        list: async () => ({ keys: [] }),
        getPublicUrl: (key: string) => '/' + key,
    },
    entries: {
        post: {
            single: 'Post',
            plural: 'Posts',
            fields: [{ name: 'body', type: 'text', label: 'Body' }],
        },
    },
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
            expect(vite?.resolve.alias['@/']).toBe(`${packageSource}/`);
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
});

async function runSetup() {
    const integration = astromech();
    const fakes = createFakes();
    await integration.hooks['astro:config:setup']?.(fakes.setup);
    return { integration, ...fakes };
}

function createFakes() {
    const recorded: Recorded = {
        updateConfig: [],
        injectRoute: [],
        addMiddleware: [],
        injectTypes: [],
        warnings: [],
    };
    const logger = {
        info: () => undefined,
        warn: (message: string) => recorded.warnings.push(message),
        error: () => undefined,
        debug: () => undefined,
    };
    const config = { root: pathToFileURL(`${root}/`) };

    const setup = {
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

    return { recorded, setup, done };
}
