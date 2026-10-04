/**
 * A new password signs out the sessions the old one opened, through the real
 * Better Auth handler: a reset revokes every session, and a change revokes
 * every other one whatever the client asks.
 */

import type { DB } from '@/database/types';
import type { EmailDriver } from '@/types/index';
import type { Kysely } from 'kysely';
import { signInTestUser, TEST_PASSWORD } from '@tests/auth';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleAuthRequest } from '@/auth/better-auth';

type EmailMessage = Parameters<EmailDriver['send']>[0];

const EMAIL = 'signed-in@test.dev';
const NEW_PASSWORD = 'new-password-456';

let db: Kysely<DB>;
let basePath: string;
let sent: EmailMessage[];

beforeEach(async () => {
    db = await createTestDb();
    sent = [];
    basePath = setupTestConfig({
        ...makeTestConfig(),
        email: {
            name: 'capture',
            send: async (message) => {
                sent.push(message);
            },
        },
    }).basePath;
});

function authRequest(
    method: 'GET' | 'POST',
    path: string,
    headers: Headers = new Headers(),
    body?: unknown
): Promise<Response> {
    const sendsBody = body !== undefined;
    const request = new Request(`http://localhost${basePath}/api/auth/${path}`, {
        method,
        headers: sendsBody
            ? new Headers([...headers, ['Content-Type', 'application/json']])
            : headers,
        ...(sendsBody && { body: JSON.stringify(body) }),
    });
    return handleAuthRequest(request, undefined);
}

/** Sign `EMAIL` in again, and return the headers that carry the new session. */
async function signInAgain(password: string = TEST_PASSWORD): Promise<Headers> {
    const response = await authRequest('POST', 'sign-in/email', new Headers(), {
        email: EMAIL,
        password,
    });
    expect(response.status).toBe(200);
    return cookieHeaders(response);
}

/** The headers a browser sends after `response`, carrying its session cookie. */
function cookieHeaders(response: Response): Headers {
    const cookie = response.headers
        .getSetCookie()
        .map((line) => line.split(';', 1)[0])
        .join('; ');
    return new Headers({ cookie });
}

/** Whether Better Auth accepts the session the `headers` carry. */
async function isSignedIn(headers: Headers): Promise<boolean> {
    const response = await authRequest('GET', 'get-session', headers);
    expect(response.status).toBe(200);
    return (await response.json()) !== null;
}

describe('a password reset', () => {
    it('signs out every session the user had', async () => {
        const first = await signInTestUser(db, EMAIL);
        const second = await signInAgain();
        expect(await isSignedIn(first.headers)).toBe(true);
        expect(await isSignedIn(second)).toBe(true);

        const requested = await authRequest('POST', 'request-password-reset', undefined, {
            email: EMAIL,
            redirectTo: `${basePath}/reset-password`,
        });
        expect(requested.status).toBe(200);
        const token = /\/reset-password\/([A-Za-z0-9]+)\?/.exec(sent[0]?.html ?? '')?.[1];
        expect(token).toBeDefined();
        const reset = await authRequest('POST', 'reset-password', undefined, {
            token,
            newPassword: NEW_PASSWORD,
        });
        expect(reset.status).toBe(200);

        expect(await isSignedIn(first.headers)).toBe(false);
        expect(await isSignedIn(second)).toBe(false);
    });
});

describe('a password change', () => {
    it.each([
        ['leaves revokeOtherSessions out', {}],
        ['sends revokeOtherSessions: false', { revokeOtherSessions: false }],
    ])(
        'signs out the other sessions when the client %s',
        async (_label, revokeOption) => {
            const other = await signInTestUser(db, EMAIL);
            const current = await signInAgain();

            const changed = await authRequest('POST', 'change-password', current, {
                currentPassword: TEST_PASSWORD,
                newPassword: NEW_PASSWORD,
                ...revokeOption,
            });
            expect(changed.status).toBe(200);

            expect(await isSignedIn(other.headers)).toBe(false);
            // The caller carries on in the session the change hands back.
            expect(await isSignedIn(cookieHeaders(changed))).toBe(true);
        }
    );
});
