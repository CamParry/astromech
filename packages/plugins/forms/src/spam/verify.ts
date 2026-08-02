/**
 * Verifies a spam-provider token (Turnstile or reCAPTCHA) against the provider's
 * `siteverify` endpoint. Fails closed on every error path — a missing token, a
 * bad status, an unparseable body and a network throw all return `ok: false`.
 */

import type { SpamOptions } from '../types.js';

export type SpamVerdict = { ok: true } | { ok: false; reason: string };

const VERIFY_URL: Record<SpamOptions['provider'], string> = {
    turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
};

const DEFAULT_MIN_SCORE = 0.5;

/** Shape of the provider's JSON response, so far as either provider guarantees. */
type SiteverifyResponse = {
    success?: unknown;
    score?: unknown;
    'error-codes'?: unknown;
};

/** Narrows an unknown response body to the shape the checks below read. */
function isSiteverifyResponse(value: unknown): value is SiteverifyResponse {
    return typeof value === 'object' && value !== null;
}

/** The provider's error codes as a comma-separated string, or `undefined`. */
function formatErrorCodes(body: SiteverifyResponse): string | undefined {
    const codes = body['error-codes'];
    if (!Array.isArray(codes) || codes.length === 0) return undefined;
    return codes.map((code) => String(code)).join(', ');
}

/** Verify one token against the configured provider. */
export async function verifySpamToken(
    spam: SpamOptions,
    token: string | undefined,
    remoteIp?: string
): Promise<SpamVerdict> {
    if (token === undefined || token.trim() === '') {
        return { ok: false, reason: 'Missing verification token' };
    }

    const params = new URLSearchParams({ secret: spam.secretKey, response: token });
    if (remoteIp !== undefined) {
        params.set('remoteip', remoteIp);
    }

    let response: Response;
    try {
        response = await fetch(VERIFY_URL[spam.provider], {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        });
    } catch {
        return { ok: false, reason: 'Verification request failed' };
    }

    if (!response.ok) {
        return { ok: false, reason: `Verification request failed (${response.status})` };
    }

    let body: unknown;
    try {
        body = await response.json();
    } catch {
        return { ok: false, reason: 'Verification response was not valid JSON' };
    }

    if (!isSiteverifyResponse(body)) {
        return { ok: false, reason: 'Verification response was malformed' };
    }

    if (body.success !== true) {
        const codes = formatErrorCodes(body);
        return {
            ok: false,
            reason:
                codes !== undefined
                    ? `Verification failed (${codes})`
                    : 'Verification failed',
        };
    }

    // reCAPTCHA v3 carries a numeric `score`; v2 and Turnstile pass on `success`.
    if (spam.provider === 'recaptcha' && typeof body.score === 'number') {
        const minScore = spam.minScore ?? DEFAULT_MIN_SCORE;
        if (body.score < minScore) {
            return { ok: false, reason: `Score ${body.score} below minimum ${minScore}` };
        }
    }

    return { ok: true };
}
