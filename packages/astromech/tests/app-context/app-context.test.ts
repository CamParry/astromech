/**
 * The `AppContext` a method runs with: one per request, built from the request
 * store and cached on it, and the plugin layer assembled over the same object.
 */

import type { AppContext, MethodsFor, Role, User } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { createAppContext, currentAppContext } from '@/app-context/app-context';
import { bindCurrent } from '@/app-context/services';
import { createPluginContext } from '@/plugins/runtime/plugin-runtime';
import { runWithContext } from '@/request-context/request-context';
import { defineService } from '@/services/define-service';

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
    'settings',
    'user',
    'users',
];

type WhoService = {
    who(input: undefined): Promise<string | null>;
};

const who: MethodsFor<WhoService>['who'] = {
    access: 'public',
    mutates: false,
    handler: async (_input, ctx) => ctx.user?.id ?? null,
};

const whoService = defineService<WhoService>('who', { who });

/** Run `fn` as `user`, the way a request-scoped transport would. */
function asUser<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return runWithContext(
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
    it('binds each call to the context of the request it is made in', async () => {
        const service = bindCurrent(whoService);

        expect(await asUser('user-1', () => service.who(undefined))).toBe('user-1');
    });

    it('binds to the system context outside a request', async () => {
        const service = bindCurrent(whoService);

        expect(await service.who(undefined)).toBeNull();
    });
});

describe('createPluginContext', () => {
    it('is the app context, plus the plugin layer and nothing else', () => {
        const ctx = createPluginContext(identity, null, editor);

        expect(Object.keys(ctx).sort()).toEqual(
            [...APP_CONTEXT_KEYS, 'plugin', 'plugins', 'storage'].sort()
        );
    });

    it('carries the plugin’s identity and its own config view', () => {
        const ctx = createPluginContext(identity, null, editor);

        expect(ctx.plugin).toBe(identity);
        expect(typeof ctx.config.entryTypesWithField).toBe('function');
    });

    it('acts as the user and role it was built for', () => {
        const user = { id: 'user-1' } as User;
        const ctx = createPluginContext(identity, user, editor, '203.0.113.1');

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
});
