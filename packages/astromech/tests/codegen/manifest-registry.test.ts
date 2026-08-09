/**
 * Method-manifest registry.
 *
 * The unset case is the point: a plugin loaded outside a booted runtime must be
 * able to tell "not generated yet" from a manifest, not get a throw.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getMethodManifest, setMethodManifest } from '@/codegen/manifest-registry';
import type { CoreManifestMethod, MethodManifest } from '@/types/index';

beforeEach(() => {
    globalThis.__astromech = undefined;
});

const method: CoreManifestMethod = {
    id: 'users.query',
    name: 'users.query',
    source: 'core',
    domain: 'users',
    method: 'query',
    permission: null,
    mutates: false,
    destructive: false,
    idempotent: false,
};

const manifest: MethodManifest = { version: 2, methods: [method] };

describe('method manifest registry', () => {
    it('is undefined before it is set', () => {
        expect(getMethodManifest()).toBeUndefined();
    });

    it('round-trips the manifest it was given', () => {
        setMethodManifest(manifest);

        expect(getMethodManifest()).toBe(manifest);
        expect(getMethodManifest()?.methods[0]?.id).toBe('users.query');
    });

    it('is undefined again once the slot is reset', () => {
        setMethodManifest(manifest);
        globalThis.__astromech = undefined;

        expect(getMethodManifest()).toBeUndefined();
    });
});
