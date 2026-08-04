/**
 * The document-validator registry.
 *
 * An authored `validate` cannot travel through the JSON-serialised virtual
 * config, so boot registers the functions from the live resolved config and the
 * write paths look them up by key.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
    getDocumentValidator,
    registerDocumentValidators,
    resetDocumentValidators,
    setDocumentValidator,
} from '@/fields/document-validators.js';
import { resolveConfig } from '@/boot/config-resolver.js';
import { makeTestConfig } from '@tests/harness.js';
import type { AstromechConfig, DocumentValidator } from '@/types/index.js';

const say =
    (message: string): DocumentValidator =>
    async () =>
        message;

/** Resolve a config on top of the harness's representative one. */
function resolved(overrides: Partial<AstromechConfig>) {
    return resolveConfig({ ...makeTestConfig(), ...overrides });
}

beforeEach(() => {
    resetDocumentValidators();
});

// ---------------------------------------------------------------------------
// The store itself
// ---------------------------------------------------------------------------

describe('set / get / reset', () => {
    it('round-trips a validator under its key', () => {
        const validator = say('nope');
        setDocumentValidator('entry:post', validator);
        expect(getDocumentValidator('entry:post')).toBe(validator);
    });

    it('returns undefined for an unregistered key', () => {
        expect(getDocumentValidator('entry:ghost')).toBeUndefined();
    });

    it('reset empties the registry', () => {
        setDocumentValidator('media', say('nope'));
        resetDocumentValidators();
        expect(getDocumentValidator('media')).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Walking a resolved config
// ---------------------------------------------------------------------------

describe('registerDocumentValidators', () => {
    it('registers a root entry type under `entry:<type>`', () => {
        const validator = say('entry problem');
        const base = makeTestConfig();
        registerDocumentValidators(
            resolved({
                entries: {
                    ...base.entries,
                    post: { ...base.entries['post']!, validate: validator },
                },
            })
        );
        expect(getDocumentValidator('entry:post')).toBe(validator);
    });

    it('registers a plugin entry type under the QUALIFIED key', () => {
        const validator = say('plugin entry problem');
        registerDocumentValidators(
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
        expect(getDocumentValidator('entry:redirects/redirect')).toBe(validator);
        expect(getDocumentValidator('entry:redirect')).toBeUndefined();
    });

    it('registers media, users and settings pages', () => {
        const media = say('media problem');
        const users = say('users problem');
        const page = say('settings problem');
        registerDocumentValidators(
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
        expect(getDocumentValidator('media')).toBe(media);
        expect(getDocumentValidator('users')).toBe(users);
        expect(getDocumentValidator('setting:site')).toBe(page);
    });

    it('skips anything that declares no validator', () => {
        registerDocumentValidators(resolved({}));
        expect(getDocumentValidator('entry:post')).toBeUndefined();
        expect(getDocumentValidator('media')).toBeUndefined();
        expect(getDocumentValidator('users')).toBeUndefined();
    });

    // A re-boot (every `setupTestConfig` in a suite, or a dev-server restart)
    // must not leave the previous config's validators behind.
    it('clears the previous registration', () => {
        const base = makeTestConfig();
        registerDocumentValidators(
            resolved({
                entries: {
                    ...base.entries,
                    post: { ...base.entries['post']!, validate: say('first') },
                },
            })
        );
        registerDocumentValidators(resolved({}));
        expect(getDocumentValidator('entry:post')).toBeUndefined();
    });
});
