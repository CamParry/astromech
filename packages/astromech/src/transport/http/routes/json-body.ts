/**
 * Reading a JSON request body, for a route that answers a body it cannot read
 * with a 400 rather than letting `c.req.json()` throw.
 */

import type { Context } from 'hono';
import { badRequest } from '@/transport/http/middleware/errors';
import { isRecord } from '@/utilities/is-record';

/**
 * The request body parsed as JSON, or a 400 when it is not JSON. An empty body
 * is not JSON.
 */
export async function readJsonBody(c: Context): Promise<{ value: unknown } | Response> {
    try {
        return { value: JSON.parse(await c.req.text()) as unknown };
    } catch {
        return badRequest(c, 'Invalid JSON body');
    }
}

/**
 * The request body as a JSON object, or a 400 when it is not JSON or is another
 * JSON value.
 */
export async function readJsonObject(
    c: Context
): Promise<Record<string, unknown> | Response> {
    const body = await readJsonBody(c);
    if (body instanceof Response) return body;
    if (!isRecord(body.value)) {
        return badRequest(c, 'The request body must be a JSON object');
    }
    return body.value;
}
