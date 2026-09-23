/**
 * `astromech call` resolving a manifest id to a callable tool.
 *
 * The property worth holding: a method the CLI cannot call fails with the
 * reason the dispatcher declared, never a generic error. `buildDispatch` is the
 * trusted, unscoped path, so `sessionScoped` is one of those reasons.
 */

import type { ManifestMethod } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '@/errors/validation';
import { resolveCallable } from '@/transport/cli/commands/call';
import { describeCallError } from '@/transport/cli/output';

function coreMethod(overrides: Partial<ManifestMethod> = {}): ManifestMethod {
    return {
        source: 'core',
        id: 'users.get',
        name: 'users.get',
        module: 'users',
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
        module: 'notifications',
        method: 'list',
        permission: null,
        sessionScoped: true,
    }),
    coreMethod({
        id: 'media.upload',
        name: 'media.upload',
        module: 'media',
        method: 'upload',
        permission: 'media:create',
        mutates: true,
        binaryInput: true,
    }),
    coreMethod({
        id: 'settings.all',
        name: 'settings.all',
        module: 'settings',
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

describe('describeCallError', () => {
    it('prints a method input failure as its issues', () => {
        const parsed = z.object({ id: z.string() }).safeParse({ id: 42 });
        if (parsed.success) expect.unreachable('expected the parse to fail');

        const error = describeCallError(new ValidationError(parsed.error.issues));
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/^Invalid arguments:\n/);
        expect((error as Error).message).toContain('at id');
    });

    it('passes any other error through', () => {
        const error = new Error('boom');
        expect(describeCallError(error)).toBe(error);
    });
});

describe('describeCallError on a field failure', () => {
    it('lists each field message and form message', () => {
        const error = ValidationError.fromFieldErrors(
            { role: ['Unknown role "wizard".'] },
            ['Whole-resource rule failed.']
        );
        expect((describeCallError(error) as Error).message).toBe(
            'Validation failed:\n  Whole-resource rule failed.\n  role: Unknown role "wizard".'
        );
    });
});
