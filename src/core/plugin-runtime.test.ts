import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginContext, PluginDefinition, ResolvedConfig, User } from '@/types/index.js';
import {
    createPluginContext,
    emitEvent,
    getPluginRawRoutes,
    getPluginSdkMethods,
    registerPlugins,
    runAfterHooks,
    runBeforeHooks,
} from '@/core/plugin-runtime.js';
import { resolvePluginIdentity } from '@/core/plugin-identity.js';

const config: ResolvedConfig = {
    adminRoute: '/admin',
    apiRoute: '/api',
    entries: {
        posts: {
            single: 'Post',
            plural: 'Posts',
            fieldGroups: [
                { name: 'main', label: 'Main', location: 'main', fields: [{ name: 'body', type: 'richtext' }] },
                { name: 'seo', label: 'SEO', location: 'sidebar', fields: [{ name: 'seo-meta', type: 'json' }] },
            ],
        },
        pages: {
            single: 'Page',
            plural: 'Pages',
            fieldGroups: [
                { name: 'main', label: 'Main', location: 'main', fields: [{ name: 'body', type: 'richtext' }] },
            ],
        },
    },
    trash: { enabled: true, retentionDays: 30 },
    storage: {
        name: 'noop',
        upload: async () => '',
        delete: () => Promise.resolve(),
        getUrl: () => '',
    },
};

const def = (partial: Partial<PluginDefinition> & { package: string }): PluginDefinition => ({
    ...partial,
});

const user: User = {
    id: 'u1',
    email: 'a@b.com',
    name: 'A',
    emailVerified: true,
    image: null,
    fields: null,
    roleSlug: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
};

beforeEach(() => {
    globalThis.__astromechPluginRuntime = undefined;
    vi.restoreAllMocks();
});

describe('registerPlugins indexing', () => {
    it('indexes sdk methods and raw routes by access key', () => {
        registerPlugins(
            [
                def({
                    package: '@astromech/redirects',
                    sdk: { lookup: { access: 'public', handler: async () => null } },
                    rawRoutes: [
                        { path: '/upload', method: 'POST', access: 'authenticated', handler: () => new Response() },
                    ],
                }),
            ],
            config
        );

        expect(getPluginSdkMethods().get('redirects')).toHaveProperty('lookup');
        expect(getPluginRawRoutes()).toHaveLength(1);
        expect(getPluginRawRoutes()[0]?.identity.name).toBe('redirects');
    });
});

describe('createPluginContext', () => {
    it('exposes the acting user, a scoped logger, and a footprint helper', () => {
        registerPlugins([def({ package: '@astromech/seo' })], config);
        const ctx = createPluginContext(resolvePluginIdentity(def({ package: '@astromech/seo' })), user);

        expect(ctx.user).toBe(user);
        expect(ctx.config.entryTypesWithField('seo-meta')).toEqual(['posts']);
        expect(ctx.config.entryTypesWithField('body')).toEqual(['posts', 'pages']);
        expect(ctx.config.entryTypesWithField('nope')).toEqual([]);
    });
});

describe('runBeforeHooks', () => {
    it('passes the event context and plugin context to the handler', async () => {
        const seen: { event: unknown; user: User | null }[] = [];
        registerPlugins(
            [
                def({
                    package: '@astromech/x',
                    hooks: {
                        'entry:beforeCreate': (eventCtx, ctx: PluginContext) => {
                            seen.push({ event: eventCtx, user: ctx.user });
                        },
                    },
                }),
            ],
            config
        );

        await runBeforeHooks('entry:beforeCreate', { type: 'posts' }, user);
        expect(seen).toEqual([{ event: { type: 'posts' }, user }]);
    });

    it('propagates a throw (aborts the operation)', async () => {
        registerPlugins(
            [
                def({
                    package: '@astromech/x',
                    hooks: {
                        'entry:beforeCreate': () => {
                            throw new Error('blocked');
                        },
                    },
                }),
            ],
            config
        );

        await expect(runBeforeHooks('entry:beforeCreate', {}, null)).rejects.toThrow('blocked');
    });
});

describe('runAfterHooks', () => {
    it('swallows a throw, logs it, and still runs other handlers', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let secondRan = false;

        registerPlugins(
            [
                def({
                    package: '@astromech/boom',
                    hooks: {
                        'entry:afterUpdate': () => {
                            throw new Error('after-fail');
                        },
                    },
                }),
                def({
                    package: '@astromech/ok',
                    hooks: {
                        'entry:afterUpdate': () => {
                            secondRan = true;
                        },
                    },
                }),
            ],
            config
        );

        await expect(runAfterHooks('entry:afterUpdate', {}, null)).resolves.toBeUndefined();
        expect(secondRan).toBe(true);
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('[plugin:boom]'),
            expect.any(Error)
        );
    });
});

describe('emitEvent', () => {
    it('fires custom-event subscribers with swallow-and-log semantics', async () => {
        const payloads: unknown[] = [];
        registerPlugins(
            [
                def({
                    package: '@astromech/sub',
                    hooks: {
                        'forms:afterSubmit': (payload: unknown) => {
                            payloads.push(payload);
                        },
                    },
                }),
            ],
            config
        );

        await emitEvent('forms:afterSubmit', { id: 42 }, null);
        expect(payloads).toEqual([{ id: 42 }]);
    });
});
