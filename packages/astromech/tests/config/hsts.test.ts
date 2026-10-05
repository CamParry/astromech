/** `security.hsts` is checked as the config resolves, so a header a browser would ignore fails at boot. */

import type { HstsConfig } from '@/types/index';
import { invalid } from '@tests/fixtures';
import { resolveTestConfig } from '@tests/harness';
import { describe, expect, it } from 'vitest';
import { AstromechError } from '@/errors/astromech-error';

describe('resolveConfig security.hsts', () => {
    it.each<boolean | HstsConfig>([
        true,
        false,
        {},
        { maxAge: 0 },
        { maxAge: 600, includeSubDomains: true },
        { maxAge: 31536000, includeSubDomains: true, preload: true },
    ])('accepts %j', (hsts) => {
        expect(resolveTestConfig({ security: { hsts } }).security?.hsts).toEqual(hsts);
    });

    it.each([-1, 1.5, Number.NaN])('refuses the maxAge %s', (maxAge) => {
        expect(() => resolveTestConfig({ security: { hsts: { maxAge } } })).toThrow(
            AstromechError
        );
    });

    it('refuses preload without includeSubDomains', () => {
        expect(() =>
            resolveTestConfig({ security: { hsts: { maxAge: 31536000, preload: true } } })
        ).toThrow('`security.hsts.preload` needs `includeSubDomains: true`');
    });

    it('refuses preload with a maxAge under a year', () => {
        expect(() =>
            resolveTestConfig({
                security: {
                    hsts: { maxAge: 600, includeSubDomains: true, preload: true },
                },
            })
        ).toThrow('`security.hsts.preload` needs a `maxAge` of at least 31536000');
    });

    it('refuses a string, as an environment variable passed straight in would be', () => {
        expect(() =>
            resolveTestConfig({ security: { hsts: invalid<boolean>('true') } })
        ).toThrow('`security.hsts` must be true, false or an object');
    });
});
