/**
 * The `siteverify` POST both built-in providers share. Fails closed on every
 * error path — a missing token, a bad status, an unparseable body and a network
 * throw all come back as a failure.
 */

/** Shape of a siteverify response, so far as either provider guarantees. */
export type SiteverifyBody = {
    success?: unknown;
    score?: unknown;
    'error-codes'?: unknown;
};

/** A verified token, carrying the body so a provider can apply extra checks. */
export type SiteverifyResult =
    | { ok: true; body: SiteverifyBody }
    | { ok: false; reason: string };

/** POST a token to a provider's siteverify endpoint and check `success`. */
export async function siteverify(
    url: string,
    secretKey: string,
    token: string | undefined,
    remoteIp?: string | undefined
): Promise<SiteverifyResult> {
    if (token === undefined || token.trim() === '') {
        return { ok: false, reason: 'Missing verification token' };
    }

    const params = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIp !== undefined) {
        params.set('remoteip', remoteIp);
    }

    let response: Response;
    try {
        response = await fetch(url, {
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

    if (!isSiteverifyBody(body)) {
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

    return { ok: true, body };
}

/** Narrows an unknown response body to the shape the checks above read. */
function isSiteverifyBody(value: unknown): value is SiteverifyBody {
    return typeof value === 'object' && value !== null;
}

/** The provider's error codes as a comma-separated string, or `undefined`. */
function formatErrorCodes(body: SiteverifyBody): string | undefined {
    const codes = body['error-codes'];
    if (!Array.isArray(codes) || codes.length === 0) return undefined;
    return codes.map((code) => String(code)).join(', ');
}
