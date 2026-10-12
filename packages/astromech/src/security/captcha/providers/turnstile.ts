/** Cloudflare Turnstile, verified against its `siteverify` endpoint. */

import type { SiteverifyBody } from '../siteverify';
import type { CaptchaVerdict } from '../types';
import type { ProviderInput } from './shared';
import { siteverify } from '../siteverify';
import { checkHostname, siteverifyParams } from './shared';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Check `token` was issued for `input.action` on an allowed hostname. An answer
 * from one of Cloudflare's test secrets names no action, so only its hostname
 * (always `example.com`) is checked.
 */
export async function verifyTurnstile(
    token: string,
    input: ProviderInput
): Promise<CaptchaVerdict> {
    const result = await siteverify(VERIFY_URL, siteverifyParams(token, input));
    if (!result.ok) return result;

    if (!isTestingKeyResult(result.body) && result.body.action !== input.action) {
        return { ok: false, reason: 'Token was issued for another action' };
    }
    return checkHostname(result.body, input.hostnames);
}

/** True when the answer says a test secret produced it (`metadata.result_with_testing_key`). */
function isTestingKeyResult(body: SiteverifyBody): boolean {
    const { metadata } = body;
    return (
        typeof metadata === 'object' &&
        metadata !== null &&
        'result_with_testing_key' in metadata &&
        metadata.result_with_testing_key === true
    );
}
