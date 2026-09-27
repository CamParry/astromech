/**
 * The error statuses a route documents. Each documented route states what it
 * can refuse a call for, and `errorResponses` turns that into OpenAPI
 * responses, so every route describes a refusal the same way.
 */

import type { ServiceMethodAccess } from '@/types/index';
import type { RouteConfig } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import {
    errorBodySchema,
    validationErrorBodySchema,
} from '@/transport/http/middleware/errors';

/** What a route can refuse a call for. */
export type Refusals = {
    /** 400, with each reason the route can answer it for. None when empty. */
    badRequest?: readonly string[];
    /** 401: the route answers a caller with no signed-in session. */
    session: boolean;
    /** 403: the route answers a caller whose role lacks a permission. */
    permission: boolean;
    /** 404, naming what may be missing. */
    notFound?: string;
    /** 409, with each reason the route can answer it for. None when empty. */
    conflict?: readonly string[];
    /** 422: the method takes arguments its input parse can refuse. */
    input: boolean;
};

/**
 * The error responses for `refusals`, keyed by status. Every route documents a
 * 500: `onError` answers an unexpected failure, and a result the method's
 * output schema refuses, with one.
 */
export function errorResponses(refusals: Refusals): RouteConfig['responses'] {
    const responses: RouteConfig['responses'] = {};
    const reasons = refusals.badRequest ?? [];
    if (reasons.length > 0) {
        responses[400] = errorResponse(`Bad request: ${reasons.join('; ')}.`);
    }
    if (refusals.session) responses[401] = errorResponse('No signed-in session.');
    if (refusals.permission) {
        responses[403] = errorResponse(
            'The caller lacks a permission this method requires.'
        );
    }
    if (refusals.notFound !== undefined) {
        responses[404] = errorResponse(refusals.notFound);
    }
    const conflicts = refusals.conflict ?? [];
    if (conflicts.length > 0) {
        responses[409] = errorResponse(`Conflict: ${conflicts.join('; ')}.`);
    }
    if (refusals.input) {
        responses[422] = {
            description:
                'The arguments failed validation. `details.fields` names each field that failed.',
            content: { 'application/json': { schema: validationErrorBodySchema } },
        };
    }
    responses[500] = errorResponse(
        'An unexpected failure, or a result its output schema refuses. The detail is in the server log.'
    );
    return responses;
}

/** One response carrying the shared `Error` body. */
function errorResponse(description: string): RouteConfig['responses'][string] {
    return {
        description,
        content: { 'application/json': { schema: errorBodySchema } },
    };
}

/**
 * The refusals a method's `access` can cause: any access but `public` needs a
 * signed-in caller, and a permission, or a function that may name one, can
 * refuse a signed-in caller too.
 */
export function accessRefusals(
    access: ServiceMethodAccess<never>
): Pick<Refusals, 'session' | 'permission'> {
    return {
        session: access !== 'public',
        permission: access !== 'public' && access !== 'authenticated',
    };
}

/**
 * Whether `input` declares any argument. `noInput()` is an empty object piped
 * into a transform, and an empty object declares none either, so a caller that
 * sends only what is documented cannot fail either one's parse.
 */
export function declaresArguments(input: z.ZodType): boolean {
    let schema: unknown = input;
    while (schema instanceof z.ZodPipe) schema = schema.in;
    return !(schema instanceof z.ZodObject) || Object.keys(schema.shape).length > 0;
}
