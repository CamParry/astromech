/**
 * Captcha middleware: refuses a request whose captcha token fails the check for
 * its action, in the error shape Better Auth's own routes answer with.
 */

import type { ServerBindings } from '@/transport/http/client-address';
import { createMiddleware } from 'hono/factory';
import { CAPTCHA_HEADER } from '@/security/captcha/types';
import { verifyCaptcha } from '@/security/captcha/verify';
import { getClientAddress } from '@/transport/http/client-address';

/** Refuse a request whose `x-captcha-response` fails the captcha check for `action` with 403 `CAPTCHA_FAILED`. */
export function requireCaptcha(action: string) {
    return createMiddleware<{ Bindings: ServerBindings }>(async (c, next) => {
        const verdict = await verifyCaptcha({
            token: c.req.header(CAPTCHA_HEADER),
            action,
            clientAddress: getClientAddress(c),
            hostname: new URL(c.req.url).hostname,
        });
        if (!verdict.ok) {
            return c.json(
                {
                    code: 'CAPTCHA_FAILED',
                    message: 'The captcha check failed. Try again.',
                },
                403
            );
        }
        return next();
    });
}
