/** Cloudflare Turnstile, verified against its `siteverify` endpoint. */

import type { CaptchaVerdict } from '../types';
import type { ProviderInput } from './shared';
import { siteverify } from '../siteverify';
import { checkHostname, siteverifyParams } from './shared';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Check `token` was issued for `input.action` on an allowed hostname. */
export async function verifyTurnstile(
    token: string,
    input: ProviderInput
): Promise<CaptchaVerdict> {
    const result = await siteverify(VERIFY_URL, siteverifyParams(token, input));
    if (!result.ok) return result;

    if (result.body.action !== input.action) {
        return { ok: false, reason: 'Token was issued for another action' };
    }
    return checkHostname(result.body, input.hostnames);
}
