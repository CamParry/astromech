/**
 * Scoped service handles — the structural half of permission enforcement.
 *
 * The point being tested is not "the check returns false" (that is
 * `permissionsFor`'s job, covered in tests/permissions) but that a caller
 * holding a scoped handle CANNOT reach the underlying service: the refusal
 * happens before the service function is entered.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestConfig } from '@tests/harness';
import { PermissionDeniedError } from '@/errors/index';
import { annotateManifest } from '@/policies/annotate-manifest';
import { scopeEntries, scopeMethods, scopedServices } from '@/policies/scoped-services';
import { permissionsFor } from '@/permissions/permissions-for';
import { runWithContext } from '@/request-context/index';
import type {
    CoreManifestMethod,
    EntriesService,
    ManifestMethod,
    Permission,
    Role,
    ServiceMethodContract,
    User,
} from '@/types/index';

beforeEach(() => {
    setupTestConfig();
});

function role(...permissions: Permission[]): Role {
    return { slug: 'test', name: 'Test', permissions, isBuiltIn: false };
}

// ---------------------------------------------------------------------------
// scopeMethods
// ---------------------------------------------------------------------------

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
    read: { permission: 'settings:read', mutates: false },
    write: { permission: 'settings:update', mutates: true },
} satisfies Record<string, ServiceMethodContract>;

describe('scopeMethods', () => {
    it('refuses a method the role lacks, without entering the service', () => {
        const service = makeService();
        const scoped = scopeMethods(
            service,
            contracts,
            permissionsFor(role('settings:read')),
            'settings'
        );

        expect(() => scoped.write()).toThrow(PermissionDeniedError);
        expect(service.write).not.toHaveBeenCalled();
    });

    it('names the method and the permission it needed', () => {
        const scoped = scopeMethods(
            makeService(),
            contracts,
            permissionsFor(role('settings:read')),
            'settings'
        );

        try {
            scoped.write();
            expect.unreachable('scoped.write() should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(PermissionDeniedError);
            const denied = e as PermissionDeniedError;
            expect(denied.method).toBe('settings.write');
            expect(denied.permission).toBe('settings:update');
        }
    });

    it('calls through and returns the service result when the role holds it', async () => {
        const service = makeService();
        const scoped = scopeMethods(
            service,
            contracts,
            permissionsFor(role('settings:read', 'settings:update')),
            'settings'
        );

        await expect(scoped.write()).resolves.toBe('write-result');
        expect(service.write).toHaveBeenCalledTimes(1);
    });

    it('passes the call arguments through unchanged', async () => {
        const service = makeService();
        const scoped = scopeMethods(
            service,
            contracts,
            permissionsFor(role('settings:read')),
            'settings'
        );

        await scoped.read({ key: 'site.title' });
        expect(service.read).toHaveBeenCalledWith({ key: 'site.title' });
    });

    it('fails closed on a method with no contract, even for a wildcard role', () => {
        const service = makeService();
        const scoped = scopeMethods(
            service,
            contracts,
            permissionsFor(role('*')),
            'settings'
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
            permissionsFor(undefined),
            'settings'
        );

        expect(() => scoped.read()).toThrow(PermissionDeniedError);
    });

    it('treats a null role the same as an absent one', () => {
        const permissions = permissionsFor(null);
        expect(permissions.allows('settings:read')).toBe(false);
        expect(permissions.allowsMethod(contracts.read)).toBe(false);

        const scoped = scopeMethods(makeService(), contracts, permissions, 'settings');
        expect(() => scoped.read()).toThrow(PermissionDeniedError);
    });

    it('passes non-function values through unchanged', () => {
        const scoped = scopeMethods(
            makeService(),
            contracts,
            permissionsFor(role('*')),
            'settings'
        );

        expect(scoped.label).toBe('not-a-function');
    });
});

// ---------------------------------------------------------------------------
// scopeMethods — session-scoped contracts (decisions/0037)
// ---------------------------------------------------------------------------

const sessionContracts = {
    read: { sessionScoped: true, mutates: false },
} satisfies Record<string, ServiceMethodContract>;

/** A scoped handle over `makeService()`, with `read` declared session-scoped. */
function scopeSession(service: ReturnType<typeof makeService>) {
    return scopeMethods(service, sessionContracts, permissionsFor(role()), 'inbox');
}

/** Run `fn` as `id`, the way a request-scoped transport would. */
function asUser<T>(id: string, fn: () => T): T {
    return runWithContext({ user: { id } as User, role: null }, fn);
}

describe('scopeMethods — session-scoped', () => {
    it('fills userId from the request context, with no permission held', async () => {
        const service = makeService();
        const scoped = scopeSession(service);

        await asUser('user-1', () => scoped.read({}));
        expect(service.read).toHaveBeenCalledWith({ userId: 'user-1' });
    });

    it('overwrites a caller-supplied userId rather than trusting it', async () => {
        const service = makeService();
        const scoped = scopeSession(service);

        await asUser('user-1', () => scoped.read({ userId: 'someone-else' }));
        expect(service.read).toHaveBeenCalledWith({ userId: 'user-1' });
    });

    it('refuses when nobody is signed in, without entering the service', () => {
        const service = makeService();
        const scoped = scopeSession(service);

        try {
            scoped.read({});
            expect.unreachable('a session-scoped method needs a signed-in user');
        } catch (e) {
            expect(e).toBeInstanceOf(PermissionDeniedError);
            expect((e as Error).message).toContain('session-scoped');
        }
        expect(service.read).not.toHaveBeenCalled();
    });

    it('leaves a method that is not session-scoped alone', async () => {
        const service = makeService();
        const scoped = scopeMethods(
            service,
            contracts,
            permissionsFor(role('settings:read')),
            'settings'
        );

        await asUser('user-1', () => scoped.read({ key: 'site.title' }));
        expect(service.read).toHaveBeenCalledWith({ key: 'site.title' });
    });
});

// ---------------------------------------------------------------------------
// scopeEntries
// ---------------------------------------------------------------------------

function makeEntriesStub() {
    return {
        query: vi.fn(() => Promise.resolve('queried')),
        update: vi.fn(() => Promise.resolve('updated')),
        publish: vi.fn(() => Promise.resolve('published')),
    };
}

/** The stub is a slice of `EntriesService`; the wrapper only reads its keys. */
function scopeStub(stub: object, actingRole: Role | undefined): Record<string, never> {
    return scopeEntries(
        stub as unknown as EntriesService,
        permissionsFor(actingRole)
    ) as unknown as Record<string, never>;
}

/** Call a scoped entries method with an arbitrary (possibly invalid) input. */
function call(scoped: Record<string, never>, key: string, input: unknown): unknown {
    return (scoped[key] as unknown as (i: unknown) => unknown)(input);
}

describe('scopeEntries', () => {
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
        const scoped = scopeStub(stub, role('*'));

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
            call(scoped, 'update', { type: 'redirects/redirect', id: '1', data: {} });
            expect.unreachable('a root entry grant must not reach a plugin entry type');
        } catch (e) {
            expect((e as PermissionDeniedError).permission).toBe(
                'plugin:redirects:entry:redirect:update'
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

// ---------------------------------------------------------------------------
// scopedServices — the composed handle over the real services
// ---------------------------------------------------------------------------

describe('scopedServices', () => {
    it('refuses a real core method the role lacks', () => {
        const scoped = scopedServices(role('users:read'));

        try {
            void scoped.users.create({ email: 'a@b.dev', name: 'A' });
            expect.unreachable('users.create must be refused for a read-only role');
        } catch (e) {
            expect(e).toBeInstanceOf(PermissionDeniedError);
            expect((e as PermissionDeniedError).method).toBe('users.create');
            expect((e as PermissionDeniedError).permission).toBe('users:create');
        }
    });

    it('refuses media.replace to a role without media:upload', () => {
        const scoped = scopedServices(role('media:read', 'media:update'));

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
        const scoped = scopedServices(null);

        expect(() => scoped.users.query()).toThrow(PermissionDeniedError);
    });
});

// ---------------------------------------------------------------------------
// annotateManifest
// ---------------------------------------------------------------------------

function coreMethod(
    name: string,
    permission: string | null,
    dynamic = false
): CoreManifestMethod {
    const method: CoreManifestMethod = {
        id: `users.${name}`,
        name: `users.${name}`,
        source: 'core',
        domain: 'users',
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
});
