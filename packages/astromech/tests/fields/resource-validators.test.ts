/**
 * The resource-validator registry.
 *
 * An authored `validate` cannot travel through the JSON-serialised virtual
 * config, so boot registers the functions from the live resolved config and the
 * write paths look them up by key.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
    getResourceValidator,
    registerResourceValidators,
    resetResourceValidators,
    setResourceValidator,
} from '@/fields/resource-validators.js';
import { resolveConfig } from '@/boot/config-resolver.js';
import { makeTestConfig } from '@tests/harness.js';
import type { AstromechConfig, ResourceValidator } from '@/types/index.js';

const say =
    (message: string): ResourceValidator =>
    async () =>
        message;

/** Resolve a config on top of the harness's representative one. */
function resolved(overrides: Partial<AstromechConfig>) {
    return resolveConfig({ ...makeTestConfig(), ...overrides });
}

beforeEach(() => {
    resetResourceValidators();
});

// ---------------------------------------------------------------------------
// The store itself
// ---------------------------------------------------------------------------

describe('set / get / reset', () => {
    it('round-trips a validator under its key', () => {
        const validator = say('nope');
        setResourceValidator('entry:post', validator);
        expect(getResourceValidator('entry:post')).toBe(validator);
    });

    it('returns undefined for an unregistered key', () => {
        expect(getResourceValidator('entry:ghost')).toBeUndefined();
    });

    it('reset empties the registry', () => {
        setResourceValidator('media', say('nope'));
        resetResourceValidators();
        expect(getResourceValidator('media')).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Walking a resolved config
// ---------------------------------------------------------------------------

describe('registerResourceValidators', () => {
    it('registers a root entry type under `entry:<type>`', () => {
        const validator = say('entry problem');
        const base = makeTestConfig();
        registerResourceValidators(
            resolved({
                entries: {
                    ...base.entries,
                    post: { ...base.entries['post']!, validate: validator },
                },
            })
        );
        expect(getResourceValidator('entry:post')).toBe(validator);
    });

    it('registers a plugin entry type under the QUALIFIED key', () => {
        const validator = say('plugin entry problem');
        registerResourceValidators(
            resolved({
                plugins: [
                    {
                        package: '@astromech/redirects',
                        entries: [
                            {
                                type: 'redirect',
                                single: 'Redirect',
                                plural: 'Redirects',
                                fields: [{ name: 'from', type: 'text' }],
                                validate: validator,
                            },
                        ],
                    },
                ],
            })
        );
        expect(getResourceValidator('entry:redirects/redirect')).toBe(validator);
        expect(getResourceValidator('entry:redirect')).toBeUndefined();
    });

    it('registers media, users and settings pages', () => {
        const media = say('media problem');
        const users = say('users problem');
        const page = say('settings problem');
        registerResourceValidators(
            resolved({
                media: { fields: [{ name: 'caption', type: 'text' }], validate: media },
                users: { fields: [{ name: 'bio', type: 'text' }], validate: users },
                admin: {
                    pages: [
                        {
                            path: 'site',
                            label: 'Site',
                            fields: [{ name: 'contact', type: 'text' }],
                            validate: page,
                        },
                    ],
                },
            })
        );
        expect(getResourceValidator('media')).toBe(media);
        expect(getResourceValidator('users')).toBe(users);
        expect(getResourceValidator('setting:site')).toBe(page);
    });

    it('skips anything that declares no validator', () => {
        registerResourceValidators(resolved({}));
        expect(getResourceValidator('entry:post')).toBeUndefined();
        expect(getResourceValidator('media')).toBeUndefined();
        expect(getResourceValidator('users')).toBeUndefined();
    });

    // A re-boot (every `setupTestConfig` in a suite, or a dev-server restart)
    // must not leave the previous config's validators behind.
    it('clears the previous registration', () => {
        const base = makeTestConfig();
        registerResourceValidators(
            resolved({
                entries: {
                    ...base.entries,
                    post: { ...base.entries['post']!, validate: say('first') },
                },
            })
        );
        registerResourceValidators(resolved({}));
        expect(getResourceValidator('entry:post')).toBeUndefined();
    });
});
