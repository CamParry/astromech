/**
 * `security.trustProxy` is checked as the config resolves, so a value that
 * would read no client address fails at boot rather than quietly.
 */

import type { TrustProxy } from '@/types/index';
import { invalid } from '@tests/fixtures';
import { resolveTestConfig } from '@tests/harness';
import { describe, expect, it } from 'vitest';
import { AstromechError } from '@/errors/astromech-error';

describe('resolveConfig security.trustProxy', () => {
    it.each<TrustProxy>([true, false, 0, 1, 3])('accepts %s', (trustProxy) => {
        const resolved = resolveTestConfig({ security: { trustProxy } });

        expect(resolved.security?.trustProxy).toBe(trustProxy);
    });

    it.each([1.5, -1, Number.NaN])('refuses the hop count %s', (trustProxy) => {
        expect(() => resolveTestConfig({ security: { trustProxy } })).toThrow(
            AstromechError
        );
    });

    it('refuses a string, as an environment variable passed straight in would be', () => {
        expect(() =>
            resolveTestConfig({ security: { trustProxy: invalid<TrustProxy>('2') } })
        ).toThrow('`security.trustProxy` must be true, false or the number of proxies');
    });
});
