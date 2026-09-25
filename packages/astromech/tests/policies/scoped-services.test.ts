/**
 * Scoped service handles — the structural half of permission enforcement.
 *
 * The point being tested is not "the check returns false" (that is
 * `permissionsFor`'s job, covered in tests/permissions) but that a caller
 * holding a scoped handle CANNOT reach the underlying service: the refusal
 * happens before the service function is entered.
 */

import type {
    AstromechConfig,
    CoreManifestMethod,
    EntriesService,
    ManifestMethod,
    Permission,
    PluginDefinition,
    Role,
    ServiceMethodContract,
    User,
} from '@/types/index';
import { contextAs, createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createAppContext } from '@/app-context/app-context';
import { createServices } from '@/app-context/services';
import { entriesDefinition } from '@/entries/service';
import { PermissionDeniedError } from '@/errors/permission';
import { permissionsFor } from '@/permissions/permissions-for';
import { annotateManifest } from '@/policies/annotate-manifest';
import { scopeMethods } from '@/policies/scoped-services';
import { noInput } from '@/services/define-service-method';

beforeEach(() => {
    setupTestConfig();
});

function role(...permissions: Permission[]): Role {
    return { slug: 'test', name: 'Test', permissions, isBuiltIn: false };
}

function makeService() {
    return {
        read: vi.fn((_input?: unknown) => Promise.resolve('read-result')),
        write: vi.fn((_input?: unknown) => Promise.resolve('write-result')),
        // Deliberately absent from the catalogue below — a service method whose
        // contract was never written stays unreachable.
        undescribed: vi.fn(() => Promise.resolve('undescribed-result')),
        label: 'not-a-function',
    };
}

const contracts = {
    read: { access: 'users:read', input: z.unknown(), mutates: false },
    write: { access: 'users:update', input: z.unknown(), mutates: true },
} satisfies Record<string, ServiceMethodContract>;

describe('scopeMethods', () => {
    it('refuses a method the role lacks, without entering the service', () => {
        const service = makeService();
        const scoped = scopeMethods(
            service,
            contracts,
            { permissions: permissionsFor(role('users:read')), user: null },
            'users'
        );

        expect(() => scoped.write()).toThrow(PermissionDeniedError);
        expect(service.write).not.toHaveBeenCalled();
    });

    it('names the method and the permission it needed', () => {
        const scoped = scopeMethods(
            makeService(),
            contracts,
            { permissions: permissionsFor(role('users:read')), user: null },
            'users'
        );

        try {
            scoped.write();
            expect.unreachable('scoped.write() should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(PermissionDeniedError);
            const denied = e as PermissionDeniedError;
            expect(denied.method).toBe('users.write');
            expect(denied.permission).toBe('users:update');
        }
    });

    it('calls through and returns the service result when the role holds it', async () => {
        const service = makeService();
        const scoped = scopeMethods(
            service,
            contracts,
            {
                permissions: permissionsFor(role('users:read', 'users:update')),
                user: null,
            },
            'users'
        );

        await expect(scoped.write()).resolves.toBe('write-result');
        expect(service.write).toHaveBeenCalledTimes(1);
    });

    it('passes the call arguments through unchanged', async () => {
        const service = makeService();
        const scoped = scopeMethods(
            service,
            contracts,
            { permissions: permissionsFor(role('users:read')), user: null },
            'users'
        );

        await scoped.read({ key: 'site.title' });
        expect(service.read).toHaveBeenCalledWith({ key: 'site.title' });
    });

    it('fails closed on a method with no contract, even for a wildcard role', () => {
        const service = makeService();
        const scoped = scopeMethods(
            service,
            contracts,
            { permissions: permissionsFor(role('*')), user: null },
            'users'
        );

        try {
            scoped.undescribed();
            expect.unreachable('an undescribed method must be refused');
        } catch (e) {
            expect(e).toBeInstanceOf(PermissionDeniedError);
            expect((e as PermissionDeniedError).permission).toBeNull();
        }
        expect(service.undescribed).not.toHaveBeenCalled();
    });

    it('refuses every gated method when there is no role', () => {
        const scoped = scopeMethods(
            makeService(),
            contracts,
            { permissions: permissionsFor(undefined), user: null },
            'users'
        );

        expect(() => scoped.read()).toThrow(PermissionDeniedError);
    });

    it('treats a null role the same as an absent one', () => {
        const permissions = permissionsFor(null);
        expect(permissions.allows('users:read')).toBe(false);
        expect(permissions.allowsMethod(contracts.read)).toBe(false);

        const scoped = scopeMethods(
            makeService(),
            contracts,
            { permissions: permissions, user: null },
            'users'
        );
        expect(() => scoped.read()).toThrow(PermissionDeniedError);
    });

    it('passes non-function values through unchanged', () => {
        const scoped = scopeMethods(
            makeService(),
            contracts,
            { permissions: permissionsFor(role('*')), user: null },
            'users'
        );

        expect(scoped.label).toBe('not-a-function');
    });
});

const sessionContracts = {
    read: { access: 'public', input: z.unknown(), sessionScoped: true, mutates: false },
} satisfies Record<string, ServiceMethodContract>;

/**
 * A scoped handle over `makeService()`, with `read` declared session-scoped,
 * acting for `userId` when given and for nobody otherwise.
 */
function scopeSession(service: ReturnType<typeof makeService>, userId?: string) {
    const user = userId === undefined ? null : ({ id: userId } as User);
    return scopeMethods(
        service,
        sessionContracts,
        { permissions: permissionsFor(role()), user },
        'inbox'
    );
}

describe('scopeMethods — session-scoped', () => {
    it('passes the input through unchanged, with no permission held', async () => {
        const service = makeService();
        const scoped = scopeSession(service, 'user-1');

        await scoped.read({ before: 'yesterday' });
        expect(service.read).toHaveBeenCalledWith({ before: 'yesterday' });
    });

    it('refuses when nobody is signed in, without entering the service', () => {
        const service = makeService();
        const scoped = scopeSession(service);

        expect(() => scoped.read({})).toThrow(PermissionDeniedError);
        expect(service.read).not.toHaveBeenCalled();
    });

    it('leaves a method that is not session-scoped alone', async () => {
        const service = makeService();
        const scoped = scopeMethods(
            service,
            contracts,
            { permissions: permissionsFor(role('users:read')), user: null },
            'users'
        );

        await scoped.read({ key: 'site.title' });
        expect(service.read).toHaveBeenCalledWith({ key: 'site.title' });
    });
});

function makeEntriesStub() {
    return {
        query: vi.fn(() => Promise.resolve('queried')),
        update: vi.fn(() => Promise.resolve('updated')),
        publish: vi.fn(() => Promise.resolve('published')),
    };
}

/**
 * The stub is a slice of `EntriesService`, scoped against the real entries
 * catalogue, whose access rules derive the permission from the call.
 */
function scopeStub(stub: object, actingRole: Role | undefined): Record<string, never> {
    return scopeMethods(
        stub as unknown as EntriesService,
        entriesDefinition.catalogue,
        { permissions: permissionsFor(actingRole), user: null },
        'entries'
    ) as unknown as Record<string, never>;
}

/** Call a scoped entries method with an arbitrary (possibly invalid) input. */
function call(scoped: Record<string, never>, key: string, input: unknown): unknown {
    return (scoped[key] as unknown as (i: unknown) => unknown)(input);
}

describe('scopeMethods over the entries catalogue', () => {
    it('derives the permission per entry type', async () => {
        const stub = makeEntriesStub();
        const scoped = scopeStub(stub, role('entry:posts:update'));

        await expect(
            call(scoped, 'update', { type: 'posts', id: '1', data: {} })
        ).resolves.toBe('updated');
        expect(() =>
            call(scoped, 'update', { type: 'pages', id: '1', data: {} })
        ).toThrow(PermissionDeniedError);
        expect(stub.update).toHaveBeenCalledTimes(1);
    });

    it('derives the permission per action', () => {
        const stub = makeEntriesStub();
        const scoped = scopeStub(stub, role('entry:posts:update'));

        try {
            call(scoped, 'publish', { type: 'posts', id: '1' });
            expect.unreachable('publish must not be reachable from an update grant');
        } catch (e) {
            expect((e as PermissionDeniedError).permission).toBe('entry:posts:publish');
        }
        expect(stub.publish).not.toHaveBeenCalled();
    });

    it('refuses a call with a missing or blank type rather than guessing one', () => {
        const stub = makeEntriesStub();
        const scoped = scopeStub(stub, role('entry:posts:update'));

        expect(() => call(scoped, 'update', { id: '1' })).toThrow(PermissionDeniedError);
        expect(() => call(scoped, 'update', { type: '', id: '1' })).toThrow(
            PermissionDeniedError
        );
        expect(() => call(scoped, 'update', undefined)).toThrow(PermissionDeniedError);
        expect(stub.update).not.toHaveBeenCalled();
    });

    it('requires the permission for every type a cross-type query names', async () => {
        const stub = makeEntriesStub();
        const scoped = scopeStub(stub, role('entry:posts:read'));

        await expect(call(scoped, 'query', { type: ['posts'] })).resolves.toBe('queried');
        expect(() => call(scoped, 'query', { type: ['posts', 'pages'] })).toThrow(
            PermissionDeniedError
        );
        expect(() => call(scoped, 'query', { type: [] })).toThrow(PermissionDeniedError);
    });

    it('resolves a plugin type to the plugin permission form', () => {
        const scoped = scopeStub(makeEntriesStub(), role('entry:*'));

        try {
            call(scoped, 'update', { type: 'forms/form', id: '1', data: {} });
            expect.unreachable('a root entry grant must not reach a plugin entry type');
        } catch (e) {
            expect((e as PermissionDeniedError).permission).toBe(
                'plugin:forms:entry:form:update'
            );
        }
    });

    it('gates the full shape behind entry:read:full, not the per-type read', async () => {
        const stub = makeEntriesStub();
        const readOnly = scopeStub(stub, role('entry:posts:read'));

        // The public projection is reachable on a bare read grant...
        await expect(call(readOnly, 'query', { type: 'posts' })).resolves.toBe('queried');

        // ...the admin shape is not. `full` rides in the same argument object as
        // `type`, so a wrapper checking only the per-type permission would have
        // handed it over.
        try {
            call(readOnly, 'query', { type: 'posts', full: true });
            expect.unreachable('full: true must not ride in on a bare read grant');
        } catch (e) {
            expect((e as PermissionDeniedError).permission).toBe('entry:read:full');
        }
        expect(stub.query).toHaveBeenCalledTimes(1);

        const withFull = scopeStub(stub, role('entry:posts:read', 'entry:read:full'));
        await expect(
            call(withFull, 'query', { type: 'posts', full: true })
        ).resolves.toBe('queried');
    });

    it('fails closed on a key it has no action for', () => {
        const stub = { mystery: vi.fn(() => Promise.resolve('x')) };
        const scoped = scopeStub(stub, role('*'));

        expect(() => call(scoped, 'mystery', { type: 'posts' })).toThrow(
            PermissionDeniedError
        );
        expect(stub.mystery).not.toHaveBeenCalled();
    });
});

/**
 * A config whose globals cover the two branches `globals.get`'s permission rule
 * takes: a `public` global (whose plain read is ungated) and a private one.
 */
function globalsConfig(): AstromechConfig {
    return {
        ...makeTestConfig(),
        globals: [
            {
                key: 'site',
                label: 'Site',
                public: true,
                fields: [{ name: 'title', type: 'text', label: 'Title' }],
            },
            {
                key: 'internal',
                label: 'Internal',
                fields: [{ name: 'note', type: 'text', label: 'Note' }],
            },
        ],
        plugins: [
            {
                package: '@astromech/seo',
                globals: [
                    {
                        key: 'settings',
                        label: 'SEO',
                        fields: [{ name: 'title', type: 'text', label: 'Title' }],
                    },
                ],
            },
        ],
    };
}

/**
 * The globals handle refuses before the service is entered, so these assert on
 * the refusal alone — the service itself has no database here.
 */
describe('the scoped handle — globals', () => {
    beforeEach(async () => {
        // The ungated branch reaches the real service, so it needs a database
        // to answer from; every other case refuses before the call.
        await createTestDb();
        setupTestConfig(globalsConfig());
    });

    it('derives the read permission per key', () => {
        const scoped = createServices(contextAs(role('global:internal:read')), {
            overrideAccess: false,
        });

        try {
            void scoped.globals.get({ key: 'site', full: true });
            expect.unreachable('a read grant for one global must not reach another');
        } catch (e) {
            expect((e as PermissionDeniedError).method).toBe('globals.get');
            expect((e as PermissionDeniedError).permission).toBe('global:site:read');
        }
    });

    it('refuses the full shape of a public global without the read permission', () => {
        const scoped = createServices(contextAs(role()), { overrideAccess: false });

        expect(() => scoped.globals.get({ key: 'site', full: true })).toThrow(
            PermissionDeniedError
        );
        expect(() => scoped.globals.get({ key: 'site', staged: true })).toThrow(
            PermissionDeniedError
        );
    });

    it('allows a public global\u2019s plain read with no role at all', async () => {
        const scoped = createServices(contextAs(null), { overrideAccess: false });

        // Reaches the service, which answers null: nothing is saved.
        await expect(scoped.globals.get({ key: 'site' })).resolves.toBeNull();
    });

    it('refuses a private global\u2019s plain read', () => {
        const scoped = createServices(contextAs(null), { overrideAccess: false });

        try {
            void scoped.globals.get({ key: 'internal' });
            expect.unreachable('a non-public global is never an anonymous read');
        } catch (e) {
            expect((e as PermissionDeniedError).permission).toBe('global:internal:read');
        }
    });

    it('gates a plugin global on the plugin permission form', () => {
        const scoped = createServices(contextAs(role('global:site:update')), {
            overrideAccess: false,
        });

        try {
            void scoped.globals.update({
                key: 'seo/settings',
                data: { fields: {} },
            });
            expect.unreachable('a host global grant must not reach a plugin global');
        } catch (e) {
            expect((e as PermissionDeniedError).permission).toBe(
                'plugin:seo:global:settings:update'
            );
        }
    });

    it('derives the permission per action', () => {
        const scoped = createServices(contextAs(role('global:internal:update')), {
            overrideAccess: false,
        });

        try {
            void scoped.globals.publish({ key: 'internal' });
            expect.unreachable('publish must not be reachable from an update grant');
        } catch (e) {
            expect((e as PermissionDeniedError).permission).toBe(
                'global:internal:publish'
            );
        }
    });
});

describe('the scoped handle', () => {
    it('refuses a real core method the role lacks', () => {
        const scoped = createServices(contextAs(role('users:read')), {
            overrideAccess: false,
        });

        try {
            void scoped.users.create({ data: { email: 'a@b.dev', name: 'A' } });
            expect.unreachable('users.create must be refused for a read-only role');
        } catch (e) {
            expect(e).toBeInstanceOf(PermissionDeniedError);
            expect((e as PermissionDeniedError).method).toBe('users.create');
            expect((e as PermissionDeniedError).permission).toBe('users:create');
        }
    });

    it('refuses media.replace to a role without media:upload', () => {
        const scoped = createServices(contextAs(role('media:read', 'media:update')), {
            overrideAccess: false,
        });

        try {
            void scoped.media.replace({
                id: 'm1',
                file: new File(['bytes'], 'a.png', { type: 'image/png' }),
            });
            expect.unreachable('media.replace must be refused without media:upload');
        } catch (e) {
            expect(e).toBeInstanceOf(PermissionDeniedError);
            expect((e as PermissionDeniedError).method).toBe('media.replace');
            expect((e as PermissionDeniedError).permission).toBe('media:upload');
        }
    });

    it('treats a null role the same as an absent one', () => {
        const scoped = createServices(contextAs(null), { overrideAccess: false });

        expect(() => scoped.users.query()).toThrow(PermissionDeniedError);
    });
});

const probePlugin: PluginDefinition = {
    package: 'probe',
    service: {
        ping: {
            access: 'public',
            input: noInput(),
            mutates: false,
            handler: () => 'pong',
        },
        whoami: {
            access: 'authenticated',
            input: noInput(),
            mutates: false,
            handler: () => 'signed in',
        },
        echo: {
            access: { permission: 'read' },
            input: z.looseObject({}),
            mutates: false,
            handler: (input) => input,
        },
        address: {
            access: 'public',
            input: noInput(),
            mutates: false,
            handler: (_input, ctx) => ctx.clientAddress ?? null,
        },
    },
};

/** The probe plugin's method `key` on a handle scoped to `actingRole`. */
function probeMethod(
    actingRole: Role | null,
    key: string
): (input?: unknown) => Promise<unknown> {
    const method = createServices(contextAs(actingRole), { overrideAccess: false })
        .plugins.probe?.[key];
    if (method === undefined) throw new Error(`probe.${key} is missing from the handle`);
    return method;
}

describe('the scoped handle — plugins', () => {
    beforeEach(() => {
        setupTestConfig({ ...makeTestConfig(), plugins: [probePlugin] });
    });

    it('runs a public method with no role', async () => {
        await expect(probeMethod(null, 'ping')()).resolves.toBe('pong');
    });

    it('refuses an authenticated method with no role, and runs it for any role', async () => {
        await expect(probeMethod(null, 'whoami')()).rejects.toThrow(
            PermissionDeniedError
        );
        await expect(probeMethod(role(), 'whoami')()).resolves.toBe('signed in');
    });

    it('gates a permission method on the plugin permission form', async () => {
        await expect(
            probeMethod(role(), 'echo')({ hello: 'world' })
        ).rejects.toMatchObject({
            name: 'PermissionDeniedError',
            method: 'plugins.probe.echo',
            permission: 'plugin:probe:read',
        });
        await expect(
            probeMethod(role('plugin:probe:read'), 'echo')({ hello: 'world' })
        ).resolves.toEqual({ hello: 'world' });
    });

    it('keeps a denied method on the handle', () => {
        expect(
            createServices(contextAs(null), { overrideAccess: false }).plugins.probe
                ?.whoami
        ).toBeTypeOf('function');
    });

    it('hands the plugin method the context the handle was built for', async () => {
        const ctx = createAppContext({
            user: null,
            role: null,
            clientAddress: '203.0.113.9',
        });
        await expect(
            createServices(ctx, { overrideAccess: false }).plugins.probe?.address?.()
        ).resolves.toBe('203.0.113.9');
    });

    it('builds one handle per context', () => {
        const ctx = contextAs(role());
        expect(createServices(ctx, { overrideAccess: false })).toBe(
            createServices(ctx, { overrideAccess: false })
        );
    });
});

function coreMethod(
    name: string,
    permission: string | null,
    dynamic = false
): CoreManifestMethod {
    const method: CoreManifestMethod = {
        id: `users.${name}`,
        name: `users.${name}`,
        source: 'core',
        module: 'users',
        method: name,
        permission,
        mutates: false,
        destructive: false,
        idempotent: false,
    };
    if (dynamic) method.permissionDynamic = true;
    return method;
}

const manifestMethods: ManifestMethod[] = [
    coreMethod('query', 'users:read'),
    coreMethod('delete', 'users:delete'),
    coreMethod('ungated', null),
    coreMethod('dynamic', null, true),
];

describe('annotateManifest', () => {
    it('decides each method for the role', () => {
        const annotated = annotateManifest(manifestMethods, role('users:read'));

        expect(annotated.map((m) => m.allowed)).toEqual([true, false, true, null]);
    });

    it('leaves the rest of the method untouched', () => {
        const [first] = annotateManifest([coreMethod('query', 'users:read')], role('*'));

        expect(first).toMatchObject({ id: 'users.query', name: 'users.query' });
    });

    it('denies every gated method when there is no role', () => {
        const annotated = annotateManifest(manifestMethods, undefined);

        expect(annotated.map((m) => m.allowed)).toEqual([false, false, true, null]);
    });

    it('denies an authenticated plugin method with no role, and allows it for any role', () => {
        const whoami: ManifestMethod = {
            id: 'plugins.probe.whoami',
            name: 'plugins.probe.whoami',
            source: 'plugin',
            plugin: 'probe',
            serviceKey: 'probe',
            method: 'whoami',
            access: 'authenticated',
            permission: null,
            mutates: false,
            destructive: false,
            idempotent: false,
        };

        expect(annotateManifest([whoami], undefined)[0]?.allowed).toBe(false);
        expect(annotateManifest([whoami], role())[0]?.allowed).toBe(true);
    });
});
