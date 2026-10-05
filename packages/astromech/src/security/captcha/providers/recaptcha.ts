/** Google reCAPTCHA v3, verified against its `siteverify` endpoint. */

import type { CaptchaVerdict } from '../types';
import type { ProviderInput } from './shared';
import { siteverify } from '../siteverify';
import { checkHostname, siteverifyParams } from './shared';

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

const DEFAULT_MIN_SCORE = 0.5;

/** Check a v3 token's action, hostname and score. A v2 token carries no action and is refused. */
export async function verifyRecaptcha(
    token: string,
    input: ProviderInput
): Promise<CaptchaVerdict> {
    const result = await siteverify(VERIFY_URL, siteverifyParams(token, input));
    if (!result.ok) return result;

    const { action, score } = result.body;
    if (action !== input.action) {
        return { ok: false, reason: 'Token was issued for another action' };
    }
    const minScore = input.minScore ?? DEFAULT_MIN_SCORE;
    if (typeof score !== 'number' || score < minScore) {
        return {
            ok: false,
            reason: `Score ${String(score)} below minimum ${minScore}`,
        };
    }
    return checkHostname(result.body, input.hostnames);
}
