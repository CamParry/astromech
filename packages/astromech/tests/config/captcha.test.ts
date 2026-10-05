/**
 * `security.captcha` is checked as the config resolves, so a setting that would
 * fail every check at request time fails at boot instead.
 */

import type { CaptchaConfig } from '@/security/captcha/types';
import { invalid } from '@tests/fixtures';
import { resolveTestConfig } from '@tests/harness';
import { describe, expect, it } from 'vitest';
import { AstromechError } from '@/errors/astromech-error';

function resolveWith(captcha: CaptchaConfig): unknown {
    return resolveTestConfig({ security: { captcha } }).security?.captcha;
}

describe('resolveConfig security.captcha', () => {
    it.each<CaptchaConfig>([
        { provider: 'turnstile', siteKey: 'k' },
        { provider: 'hcaptcha', siteKey: 'k', hostnames: ['example.test'] },
        { provider: 'recaptcha', siteKey: 'k', minScore: 0 },
        { provider: 'recaptcha', siteKey: 'k', minScore: 1, hostnames: [] },
    ])('accepts %j', (captcha) => {
        expect(resolveWith(captcha)).toEqual(captcha);
    });

    it('refuses a provider core cannot check', () => {
        expect(() =>
            resolveWith({
                provider: invalid<CaptchaConfig['provider']>('altcha'),
                siteKey: 'k',
            })
        ).toThrow(
            '`security.captcha.provider` must be one of turnstile, recaptcha, hcaptcha'
        );
    });

    it.each(['', '   '])('refuses the site key %j', (siteKey) => {
        expect(() => resolveWith({ provider: 'turnstile', siteKey })).toThrow(
            AstromechError
        );
    });

    it.each([-0.1, 1.1, Number.NaN])('refuses the minScore %s', (minScore) => {
        expect(() =>
            resolveWith({ provider: 'recaptcha', siteKey: 'k', minScore })
        ).toThrow('`security.captcha.minScore` must be a number from 0 to 1');
    });

    it('refuses minScore on a provider that returns no score', () => {
        expect(() =>
            resolveWith({ provider: 'turnstile', siteKey: 'k', minScore: 0.5 })
        ).toThrow('`security.captcha.minScore` applies to the `recaptcha` provider only');
    });

    it('refuses hostnames that are not strings', () => {
        expect(() =>
            resolveWith({
                provider: 'turnstile',
                siteKey: 'k',
                hostnames: invalid<string[]>([1]),
            })
        ).toThrow('`security.captcha.hostnames` must be an array of strings');
    });
});
