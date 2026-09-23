/**
 * The `AppContext` a method runs with: one per request, built from the request
 * store and cached on it, and the plugin layer assembled over the same object.
 */

import type { AppContext, Role, User } from '@/types/index';
import { describe, expect, it, vi } from 'vitest';
import {
    createAppContext,
    currentAppContext,
    systemAppContext,
} from '@/app-context/app-context';
import { bindCurrent } from '@/app-context/services';
import { createPluginContext } from '@/plugins/runtime/plugin-runtime';
import { runInRequestScope } from '@/request-scope/request-scope';

const editor: Role = {
    slug: 'editor',
    name: 'Editor',
    permissions: [],
    isBuiltIn: false,
};

const identity = {
    package: '@astromech/seo',
    namespace: 'seo',
    serviceKey: 'seo',
    permissionNamespace: 'seo',
};

/** Every key an `AppContext` carries, in the order this file asserts them. */
const APP_CONTEXT_KEYS = [
    'clientAddress',
    'config',
    'database',
    'db',
    'email',
    'entries',
    'env',
    'globals',
    'logger',
    'media',
    'methods',
    'notifications',
    'notify',
    'role',
    'runHook',
    'user',
    'users',
];

/** Run `fn` as `user`, the way a request-scoped transport would. */
function asUser<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return runInRequestScope(
        { request: new Request('http://localhost/'), user: { id } as User, role: editor },
        fn
    );
}

describe('currentAppContext', () => {
    it('is a system context outside a request', async () => {
        const app = await currentAppContext();

        expect(app.user).toBeNull();
        expect(app.role).toBeNull();
    });

    it('carries the request’s own user and role', async () => {
        const app = await asUser('user-1', currentAppContext);

        expect(app.user?.id).toBe('user-1');
        expect(app.role).toBe(editor);
    });

    it('builds one context per request, however many calls read it', async () => {
        const [first, second] = await asUser('user-1', async () => [
            await currentAppContext(),
            await currentAppContext(),
        ]);

        expect(first).toBe(second);
    });
});

describe('bindCurrent', () => {
    it('calls the service the current request’s context holds', async () => {
        const get = vi.fn(() => Promise.resolve(null));
        const app = { users: { get } } as unknown as AppContext;

        await runInRequestScope({ request: new Request('http://localhost/'), app }, () =>
            bindCurrent('users').get({ id: 'user-1' })
        );
        expect(get).toHaveBeenCalledWith({ id: 'user-1' });
    });

    it('binds to the one system context outside a request', async () => {
        expect(await currentAppContext()).toBe(await currentAppContext());
        expect(await currentAppContext()).toBe(systemAppContext());
    });
});

describe('createPluginContext', () => {
    it('is the app context, plus the plugin layer and nothing else', () => {
        const ctx = createPluginContext(
            identity,
            createAppContext({ user: null, role: editor })
        );

        expect(Object.keys(ctx).sort()).toEqual(
            [...APP_CONTEXT_KEYS, 'plugin', 'plugins', 'storage'].sort()
        );
    });

    it('carries the plugin’s identity and its own config view', () => {
        const ctx = createPluginContext(
            identity,
            createAppContext({ user: null, role: editor })
        );

        expect(ctx.plugin).toBe(identity);
        expect(typeof ctx.config.entryTypesWithField).toBe('function');
    });

    it('acts as the context it was built over', () => {
        const user = { id: 'user-1' } as User;
        const app = createAppContext({
            user,
            role: editor,
            clientAddress: '203.0.113.1',
        });
        const ctx = createPluginContext(identity, app);

        expect(ctx.user).toBe(user);
        expect(ctx.role).toBe(editor);
        expect(ctx.clientAddress).toBe('203.0.113.1');
    });
});

describe('createAppContext', () => {
    it('answers the user and role it was built for', () => {
        const user = { id: 'user-1' } as User;
        const app: AppContext = createAppContext({ user, role: editor });

        expect(app.user).toBe(user);
        expect(app.role).toBe(editor);
    });

    it('binds its services once, and to itself', () => {
        const app = createAppContext({ user: null, role: editor });
        const other = createAppContext({ user: null, role: editor });

        expect(app.entries).toBe(app.entries);
        expect(app.entries).not.toBe(other.entries);
        expect(app.globals).toBe(app.globals);
        expect(app.globals).not.toBe(other.globals);
        expect(app.notifications).toBe(app.notifications);
        expect(app.notifications).not.toBe(other.notifications);
        expect(app.users).toBe(app.users);
        expect(app.users).not.toBe(other.users);
        expect(app.media).toBe(app.media);
        expect(app.media).not.toBe(other.media);
    });
});
