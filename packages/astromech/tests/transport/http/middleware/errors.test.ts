/**
 * `onError`: an `HTTPException` answers the code its status names, and an
 * `ApiError` answers its own status, code and details.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import { StagedEntryExistsError } from '@/entries/errors';
import { PermissionDeniedError } from '@/errors/permission';
import { onError } from '@/transport/http/middleware/errors';

/** An app whose one route throws `error`, behind the real error handler. */
function throwing(error: Error, user?: object): OpenAPIHono {
    const app = new OpenAPIHono();
    app.onError(onError);
    app.get('/', (c) => {
        if (user !== undefined) c.set('user' as never, user as never);
        throw error;
    });
    return app;
}

type ErrorBody = {
    error: { code: string; status: number; message: string; details?: unknown };
};

async function body(res: Response): Promise<ErrorBody> {
    return (await res.json()) as ErrorBody;
}

describe('onError', () => {
    it.each([
        [400, 'BAD_REQUEST'],
        [401, 'UNAUTHORIZED'],
        [403, 'FORBIDDEN'],
        [404, 'NOT_FOUND'],
        [409, 'CONFLICT'],
        [429, 'BAD_REQUEST'],
        [503, 'INTERNAL_ERROR'],
    ] as const)('answers an HTTPException %i with %s', async (status, code) => {
        const res = await throwing(new HTTPException(status, { message: 'm' })).request(
            '/'
        );
        expect(res.status).toBe(status);
        expect((await body(res)).error).toMatchObject({ code, status, message: 'm' });
    });

    it('answers an ApiError with its own status, code and details', async () => {
        const res = await throwing(
            new StagedEntryExistsError({ canonicalId: 'e1', locale: 'de' })
        ).request('/');
        expect(res.status).toBe(409);
        expect((await body(res)).error).toMatchObject({
            code: 'staged_entry_exists',
            status: 409,
            details: { locale: 'de' },
        });
    });

    it('answers a refusal 403 with a signed-in user and 401 without one', async () => {
        const refusal = new PermissionDeniedError('users.create', 'users:create');

        const signedIn = await throwing(refusal, { id: 'u1' }).request('/');
        expect(signedIn.status).toBe(403);
        expect((await body(signedIn)).error.message).toContain('users:create');

        const anonymous = await throwing(refusal).request('/');
        expect(anonymous.status).toBe(401);
        expect((await body(anonymous)).error.code).toBe('UNAUTHORIZED');
    });
});
