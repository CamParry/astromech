/**
 * `callMethod`: how a manifest method becomes a call on a service handle. The
 * handle decides authority, so each case checks that a refusal lands before the
 * service or plugin handler runs, and that the manifest, not the caller, names the target.
 */
import type * as appServices from '@/app-context/services';
import type {
    AppContext,
    CoreManifestMethod,
    EntriesManifestMethod,
    Permission,
    PluginDefinition,
    PluginManifestMethod,
    Role,
    User,
} from '@/types/index';
import {
    contextAs,
    createTestDb,
    createTestUser,
    makeTestConfig,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { entriesService, usersService } from '@/app-context/services';
import { PermissionDeniedError } from '@/errors/permission';
import { callMethod } from '@/policies/call-method';

// Stubs, so a test can see whether the call reached the service and with what.
// Every other bound service on the module is the real one.
vi.mock('@/app-context/services', async (importOriginal) => ({
    ...(await importOriginal<typeof appServices>()),
    usersService: {
        query: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
    },
    entriesService: {
        query: vi.fn((input: unknown) => Promise.resolve(input)),
    },
}));

const echoHandler = vi.fn((input: unknown) => input);

const probePlugin: PluginDefinition = {
    package: 'probe',
    service: {
        echo: {
            access: { permission: 'read' },
            input: z.looseObject({}),
            mutates: false,
            handler: echoHandler,
        },
    },
};

const usersQuery: CoreManifestMethod = {
    id: 'users.query',
    name: 'users.query',
    source: 'core',
    module: 'users',
    method: 'query',
    permission: 'users:read',
    mutates: false,
    destructive: false,
    idempotent: false,
};

const postsQuery: EntriesManifestMethod = {
    id: 'entries.post.query',
    name: 'entries.query',
    source: 'entries',
    method: 'query',
    typeId: 'post',
    entryType: 'post',
    namespace: 'root',
    permission: 'entry:post:read',
    mutates: false,
    destructive: false,
    idempotent: false,
};

const notificationsList: CoreManifestMethod = {
    id: 'notifications.list',
    name: 'notifications.list',
    source: 'core',
    module: 'notifications',
    method: 'list',
    permission: null,
    mutates: false,
    destructive: false,
    idempotent: false,
    sessionScoped: true,
};

const probeEcho: PluginManifestMethod = {
    id: 'plugins.probe.echo',
    name: 'plugins.probe.echo',
    source: 'plugin',
    plugin: 'probe',
    serviceKey: 'probe',
    method: 'echo',
    access: 'permission',
    permission: 'plugin:probe:read',
    mutates: false,
    destructive: false,
    idempotent: false,
};

function role(...permissions: Permission[]): Role {
    return { slug: 'test', name: 'Test', permissions, isBuiltIn: false };
}

/**
 * A caller acting as `actingRole` (and `user`, when given), whose users and
 * entries services are this file's stubs.
 */
function as(actingRole: Role, user: User | null = null): { ctx: AppContext } {
    const ctx = Object.create(contextAs(actingRole, user), {
        users: { value: usersService },
        entries: { value: entriesService },
    }) as AppContext;
    return { ctx };
}

beforeEach(() => {
    setupTestConfig();
    vi.clearAllMocks();
});

describe('callMethod', () => {
    it('refuses a role without the permission before the service runs', async () => {
        await expect(
            callMethod(usersQuery, {}, as(role('users:create')))
        ).rejects.toThrow(PermissionDeniedError);
        expect(usersService.query).not.toHaveBeenCalled();
    });

    it('targets the manifest’s entry type whatever `type` the caller passes', async () => {
        const result = await callMethod(
            postsQuery,
            { type: 'note', limit: 5 },
            as(role('entry:post:read'))
        );

        expect(result).toEqual({ type: 'post', limit: 5 });
        expect(entriesService.query).toHaveBeenCalledWith({ type: 'post', limit: 5 });
    });

    it('throws for a core module the handle has no service for', async () => {
        const unknown: CoreManifestMethod = {
            ...usersQuery,
            id: 'nope.query',
            module: 'nope',
        };

        for (const caller of ['trusted', as(role('*'))] as const) {
            await expect(callMethod(unknown, {}, caller)).rejects.toThrow(
                'no service registered for domain "nope"'
            );
        }
    });
});

describe('callMethod: session-scoped', () => {
    it('refuses a trusted caller, which has no signed-in user', async () => {
        await expect(callMethod(notificationsList, {}, 'trusted')).rejects.toThrow(
            PermissionDeniedError
        );
        await expect(callMethod(notificationsList, {}, 'trusted')).rejects.toThrow(
            'session-scoped'
        );
    });

    it('runs for a role with a signed-in user', async () => {
        const db = await createTestDb();
        setupTestConfig();
        const user = await createTestUser(db, { name: 'Alice', role: 'editor' });

        const rows = await callMethod(
            notificationsList,
            {},
            as(role('admin:access'), { id: user.id } as User)
        );
        expect(rows).toEqual([]);
    });
});

describe('callMethod: plugins', () => {
    beforeEach(() => {
        setupTestConfig({ ...makeTestConfig(), plugins: [probePlugin] });
    });

    it('checks a role caller against the method’s access', async () => {
        await expect(
            callMethod(probeEcho, { hello: 'world' }, as(role()))
        ).rejects.toMatchObject({
            name: 'PermissionDeniedError',
            permission: 'plugin:probe:read',
        });
        expect(echoHandler).not.toHaveBeenCalled();

        await expect(
            callMethod(probeEcho, { hello: 'world' }, as(role('plugin:probe:read')))
        ).resolves.toEqual({ hello: 'world' });
    });

    it('skips the access check for a trusted caller', async () => {
        await expect(
            callMethod(probeEcho, { hello: 'world' }, 'trusted')
        ).resolves.toEqual({ hello: 'world' });
        expect(echoHandler).toHaveBeenCalledOnce();
    });
});
