/**
 * `astromech call` resolving a manifest id to a callable tool.
 *
 * The property worth holding: a method the CLI cannot call fails with the
 * reason the dispatcher declared, never a generic error. `buildDispatch` is the
 * trusted, unscoped path, so `sessionScoped` is one of those reasons.
 */

import { describe, expect, it } from 'vitest';
import { resolveCallable } from '@/transport/cli/commands/call';
import type { ManifestMethod } from '@/types/index';

function coreMethod(overrides: Partial<ManifestMethod> = {}): ManifestMethod {
    return {
        source: 'core',
        id: 'users.get',
        name: 'users.get',
        domain: 'users',
        method: 'get',
        permission: 'users:read',
        mutates: false,
        destructive: false,
        idempotent: true,
        input: { type: 'object', properties: { id: { type: 'string' } } },
        ...overrides,
    } as ManifestMethod;
}

const METHODS: ManifestMethod[] = [
    coreMethod(),
    coreMethod({
        id: 'notifications.list',
        name: 'notifications.list',
        domain: 'notifications',
        method: 'list',
        permission: null,
        sessionScoped: true,
    }),
    coreMethod({
        id: 'media.upload',
        name: 'media.upload',
        domain: 'media',
        method: 'upload',
        permission: 'media:create',
        mutates: true,
        binaryInput: true,
    }),
    coreMethod({
        id: 'settings.all',
        name: 'settings.all',
        domain: 'settings',
        method: 'all',
        permission: 'settings:read',
        input: null,
    }),
];

describe('resolveCallable', () => {
    it('resolves a callable method to its tool', () => {
        const { method, tool } = resolveCallable(METHODS, 'users.get');
        expect(method.id).toBe('users.get');
        expect(tool.id).toBe('users.get');
        expect(typeof tool.invoke).toBe('function');
    });

    it('names the id and points at `astromech methods` for an unknown one', () => {
        expect(() => resolveCallable(METHODS, 'users.nope')).toThrow(
            /Unknown method "users\.nope"\..*astromech methods/s
        );
    });

    it('refuses a session-scoped method with its declared reason', () => {
        expect(() => resolveCallable(METHODS, 'notifications.list')).toThrow(
            'Method "notifications.list" is not callable: session-scoped — this transport has no user'
        );
    });

    it('refuses a binary-input method with its declared reason', () => {
        expect(() => resolveCallable(METHODS, 'media.upload')).toThrow(
            'Method "media.upload" is not callable: binary input — not expressible over JSON-RPC'
        );
    });

    it('refuses a method that declares no input schema', () => {
        expect(() => resolveCallable(METHODS, 'settings.all')).toThrow(
            'Method "settings.all" is not callable: no input schema declared on the descriptor'
        );
    });
});
