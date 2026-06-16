import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    PluginContext,
    PluginDefinition,
    ResolvedConfig,
    User,
} from '@/types/index.js';
import {
    bootPlugins,
    createPluginContext,
    emitEvent,
    getPluginRawRoutes,
    getPluginSdkMethods,
    registerPlugins,
    runAfterHooks,
    runBeforeHooks,
} from '@/core/plugin-runtime.js';
import { defineHook } from '@/index.js';
import { resolvePluginIdentity } from '@/core/plugin-identity.js';
import { getCronJobs } from '@/cron/registry.js';

const config: ResolvedConfig = {
    adminRoute: '/admin',
    apiRoute: '/api',
    entries: {
        posts: {
            single: 'Post',
            plural: 'Posts',
            fields: {
                main: [
                    { name: 'body', type: 'richtext' },
                    { name: 'seo-meta', type: 'json' },
                ],
                sidebar: [],
            },
            capabilities: {
                statuses: true,
                slug: true,
                translatable: false,
                versioning: false,
                trash: true,
            },
            titleField: 'title',
        },
        pages: {
            single: 'Page',
            plural: 'Pages',
            fields: {
                main: [{ name: 'body', type: 'richtext' }],
                sidebar: [],
            },
            capabilities: {
                statuses: true,
                slug: true,
                translatable: false,
                versioning: false,
                trash: true,
            },
            titleField: 'title',
        },
    },
    pluginEntries: {},
    adminPages: [],
    trash: { enabled: true, retentionDays: 30 },
    publicSettingKeys: [],
    timezone: 'UTC',
    storage: {
        name: 'noop',
        upload: async () => '',
        delete: () => Promise.resolve(),
        getUrl: () => '',
    },
};

const def = (
    partial: Partial<PluginDefinition> & { package: string }
): PluginDefinition => ({
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
    globalThis.__astromechCronJobs = undefined;
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
                        {
                            path: '/upload',
                            method: 'POST',
                            access: 'authenticated',
                            handler: () => new Response(),
                        },
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
        const ctx = createPluginContext(
            resolvePluginIdentity(def({ package: '@astromech/seo' })),
            user
        );

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
                    hooks: [
                        defineHook(
                            'entry:beforeCreate',
                            (eventCtx, ctx: PluginContext) => {
                                seen.push({ event: eventCtx, user: ctx.user });
                            }
                        ),
                    ],
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
                    hooks: [
                        defineHook('entry:beforeCreate', () => {
                            throw new Error('blocked');
                        }),
                    ],
                }),
            ],
            config
        );

        await expect(runBeforeHooks('entry:beforeCreate', {}, null)).rejects.toThrow(
            'blocked'
        );
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
                    hooks: [
                        defineHook('entry:afterUpdate', () => {
                            throw new Error('after-fail');
                        }),
                    ],
                }),
                def({
                    package: '@astromech/ok',
                    hooks: [
                        defineHook('entry:afterUpdate', () => {
                            secondRan = true;
                        }),
                    ],
                }),
            ],
            config
        );

        await expect(
            runAfterHooks('entry:afterUpdate', {}, null)
        ).resolves.toBeUndefined();
        expect(secondRan).toBe(true);
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('[plugin:boom]'),
            expect.any(Error)
        );
    });
});

describe('bootPlugins', () => {
    it('throws naming the plugin when a required env var is missing', async () => {
        await expect(
            bootPlugins([
                def({
                    package: '@astromech/mail',
                    requiredEnv: ['ASTROMECH_TEST_MISSING_VAR'],
                }),
            ])
        ).rejects.toThrow(/@astromech\/mail.*ASTROMECH_TEST_MISSING_VAR/);
    });

    it('registers cron jobs under an auto-namespaced name with a PluginContext', async () => {
        registerPlugins([def({ package: '@astromech/seo' })], config);
        let seenUser: User | null | undefined;
        await bootPlugins([
            def({
                package: '@astromech/seo',
                cron: [
                    {
                        name: 'reindex',
                        schedule: '0 3 * * *',
                        handler: (ctx) => {
                            seenUser = ctx.user;
                        },
                    },
                ],
            }),
        ]);

        const job = getCronJobs().find((j) => j.name === 'plugin:seo:reindex');
        expect(job).toBeDefined();
        expect(job?.schedule).toBe('0 3 * * *');

        await job?.handler({} as never);
        expect(seenUser).toBeNull();
    });

    it('runs setup() with a PluginContext and wraps a throw with the plugin name', async () => {
        registerPlugins([def({ package: '@astromech/ok' })], config);
        let ranWith: PluginContext | undefined;
        await bootPlugins([
            def({
                package: '@astromech/ok',
                setup: (ctx) => {
                    ranWith = ctx;
                },
            }),
        ]);
        expect(ranWith?.user).toBeNull();

        await expect(
            bootPlugins([
                def({
                    package: '@astromech/boom',
                    setup: () => {
                        throw new Error('db unreachable');
                    },
                }),
            ])
        ).rejects.toThrow(/@astromech\/boom.*setup\(\) failed.*db unreachable/);
    });
});

describe('emitEvent', () => {
    it('fires custom-event subscribers with swallow-and-log semantics', async () => {
        const payloads: unknown[] = [];
        registerPlugins(
            [
                def({
                    package: '@astromech/sub',
                    hooks: [
                        defineHook('forms:afterSubmit', (payload: unknown) => {
                            payloads.push(payload);
                        }),
                    ],
                }),
            ],
            config
        );

        await emitEvent('forms:afterSubmit', { id: 42 }, null);
        expect(payloads).toEqual([{ id: 42 }]);
    });
});
