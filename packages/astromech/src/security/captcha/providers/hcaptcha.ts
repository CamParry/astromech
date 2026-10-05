/** hCaptcha, verified against its `siteverify` endpoint. It returns no action to check. */

import type { CaptchaVerdict } from '../types';
import type { ProviderInput } from './shared';
import { siteverify } from '../siteverify';
import { checkHostname, siteverifyParams } from './shared';

const VERIFY_URL = 'https://api.hcaptcha.com/siteverify';

/** Check `token` was solved on `input.siteKey`, on an allowed hostname. */
export async function verifyHcaptcha(
    token: string,
    input: ProviderInput
): Promise<CaptchaVerdict> {
    const result = await siteverify(VERIFY_URL, {
        ...siteverifyParams(token, input),
        sitekey: input.siteKey,
    });
    if (!result.ok) return result;
    return checkHostname(result.body, input.hostnames);
}
