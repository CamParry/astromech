import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import type {
    EmailMessage,
    PluginContext,
    PluginDefinition,
    ResolvedConfig,
    Role,
    User,
} from '@/types/index';
import { setEmailDriver } from '@/email/registry';
import { runWithContext } from '@/request-context/request-context';
import {
    bootPlugins,
    createPluginContext,
    emitEvent,
    getPluginIdentity,
    getPluginRawRoutes,
    getPluginServiceMethods,
    registerPlugins,
    runAfterHooks,
    runBeforeHooks,
    setPluginMethods,
} from '@/plugins/runtime/plugin-runtime';
import { defineHook } from '@/index';
// This test drives registerPlugins directly (no harness), so wire the
// entry-access port that registerPlugins now depends on.
import { wireEntryAccess } from '@/entries/plugin-access';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';

wireEntryAccess();
import { getCronJobs } from '@/cron/registry';
import { globals } from '@/utilities/registry';

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
                staging: false,
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
                staging: false,
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
    mediaRoute: '/_media',
    media: { access: 'public' },
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

const adminRole: Role = {
    slug: 'admin',
    name: 'Administrator',
    permissions: ['*'],
    isBuiltIn: true,
};

beforeEach(() => {
    globals().pluginRuntime = undefined;
    delete globalThis.__astromech?.cronJobs;
    delete globalThis.__astromech?.email;
    vi.restoreAllMocks();
});

describe('registerPlugins indexing', () => {
    it('indexes service methods and raw routes by access key', () => {
        registerPlugins(
            [
                def({
                    package: '@astromech/redirects',
                    service: {
                        lookup: {
                            access: 'public',
                            mutates: false,
                            handler: async () => null,
                        },
                    },
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

        expect(getPluginServiceMethods().get('redirects')).toHaveProperty('lookup');
        expect(getPluginRawRoutes()).toHaveLength(1);
        expect(getPluginRawRoutes()[0]?.identity.namespace).toBe('redirects');
    });
});

describe('getPluginIdentity', () => {
    // The API surface (HTTP route segment and `Astromech.plugins.<key>`) keys on
    // the service key alone. Resolving a namespace here as well would let a
    // caller reach a plugin by a string the client can never produce, and would
    // hide the fact that the namespace → service key derivation has no inverse.
    it('resolves by service key and NOT by namespace', () => {
        registerPlugins([def({ package: '@acme/seo-tools' })], config);

        const identity = getPluginIdentity('acmeSeoTools');
        expect(identity?.package).toBe('@acme/seo-tools');
        expect(identity?.namespace).toBe('acme_seo_tools');

        expect(getPluginIdentity('acme_seo_tools')).toBeUndefined();
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

    it('has a null role outside a request context', () => {
        registerPlugins([def({ package: '@astromech/seo' })], config);
        const ctx = createPluginContext(
            resolvePluginIdentity(def({ package: '@astromech/seo' })),
            user
        );

        expect(ctx.role).toBeNull();
    });

    // Lazy, so a context built before the store is established still reads the
    // role — and drops back to null once the request is over.
    it('reads the role from the request-scoped store', () => {
        registerPlugins([def({ package: '@astromech/seo' })], config);
        const ctx = createPluginContext(
            resolvePluginIdentity(def({ package: '@astromech/seo' })),
            user
        );

        runWithContext({ user, role: adminRole }, () => {
            expect(ctx.role).toBe(adminRole);
        });

        expect(ctx.role).toBeNull();
    });

    // The port is injected by the Local API at module load, so a context that
    // reaches it in a graph that never loaded one must say so rather than
    // returning an empty tool list.
    it('crashes loud when the methods port is unwired', () => {
        registerPlugins([def({ package: '@astromech/seo' })], config);
        const ctx = createPluginContext(
            resolvePluginIdentity(def({ package: '@astromech/seo' })),
            user
        );

        expect(() => ctx.methods.tools()).toThrow(
            '[Astromech] Plugin methods are not available in this context.'
        );
    });

    it('calls the injected port with the current role and the given options', () => {
        registerPlugins([def({ package: '@astromech/seo' })], config);
        const tools = vi.fn(() => []);
        setPluginMethods({ tools });
        const ctx = createPluginContext(
            resolvePluginIdentity(def({ package: '@astromech/seo' })),
            user
        );

        runWithContext({ user, role: adminRole }, () => {
            expect(ctx.methods.tools({ readOnly: true })).toEqual([]);
        });

        expect(tools).toHaveBeenCalledWith(adminRole, { readOnly: true });
    });

    // The port renders, rather than passing the element through: a driver only
    // ever sees html, so a plugin never touches EmailMessage or the renderer.
    it('renders the element and hands the html to the email driver', async () => {
        registerPlugins([def({ package: '@astromech/seo' })], config);
        const sent: EmailMessage[] = [];
        setEmailDriver({
            name: 'capture',
            send: async (message: EmailMessage): Promise<void> => {
                sent.push(message);
            },
        });
        const ctx = createPluginContext(
            resolvePluginIdentity(def({ package: '@astromech/seo' })),
            user
        );

        await ctx.email.send(
            'to@example.com',
            'Subject',
            createElement('p', null, 'Hello from a plugin')
        );

        expect(sent).toHaveLength(1);
        expect(sent[0]?.to).toBe('to@example.com');
        expect(sent[0]?.subject).toBe('Subject');
        expect(sent[0]?.html).toContain('Hello from a plugin');
    });

    it('throws when the site configures no email driver', async () => {
        registerPlugins([def({ package: '@astromech/seo' })], config);
        const ctx = createPluginContext(
            resolvePluginIdentity(def({ package: '@astromech/seo' })),
            user
        );

        await expect(
            ctx.email.send('to@example.com', 'Subject', createElement('p'))
        ).rejects.toThrow('[Astromech] Email is not configured');
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
