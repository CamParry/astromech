/**
 * Content Routes
 *
 * Model-driven rewrites of one entry. Every route is double-gated: the
 * contract's `content:*` permission AND `update` on the target entry type,
 * because holding "may use a model" must not rewrite a type the caller cannot
 * edit by hand.
 *
 * Routes:
 *   POST /content/:type/:id/translate  → translate()
 *   POST /content/:type/:id/transform  → transform()
 *   POST /content/:type/:id/generate   → generate()
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { Astromech } from '@/transport/local/index.js';
import {
    badRequest,
    forbidden,
    fromZodError,
    notFound,
} from '@/transport/http/middleware/errors.js';
import type { AuthVariables } from '@/transport/http/middleware/auth.js';
import { entryPermission } from '@/permissions/index.js';
import { permissionsFor } from '@/permissions/permissions-for.js';
import { contentContract } from '@/content/index.js';
import { ContentOperationError } from '@/content/errors.js';
import { CapabilityError } from '@/entries/errors.js';
import { resolveEntryType } from '@/entries/type-ids.js';
import type {
    ContentOperationResult,
    Permission,
    ServiceMethodContract,
} from '@/types/index.js';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

// ============================================================================
// POST /content/:type/:id/translate
// ============================================================================

router.post('/:type/:id/translate', async (c) => {
    const { type, id } = c.req.param();
    const denied = guard(c, type, contentContract.translate);
    if (denied) return denied;

    const parsed = contentContract.translate.input.safeParse({
        ...((await readJson(c)) as object),
        type,
        id,
    });
    if (!parsed.success) return fromZodError(c, parsed.error);

    const { locale, instruction, paths } = parsed.data;
    return run(c, () =>
        Astromech.content.translate({
            type,
            id,
            locale,
            ...(instruction === undefined ? {} : { instruction }),
            ...(paths === undefined ? {} : { paths }),
        })
    );
});

// ============================================================================
// POST /content/:type/:id/transform
// ============================================================================

router.post('/:type/:id/transform', async (c) => {
    const { type, id } = c.req.param();
    const denied = guard(c, type, contentContract.transform);
    if (denied) return denied;

    const parsed = contentContract.transform.input.safeParse({
        ...((await readJson(c)) as object),
        type,
        id,
    });
    if (!parsed.success) return fromZodError(c, parsed.error);

    const { instruction, paths } = parsed.data;
    return run(c, () =>
        Astromech.content.transform({
            type,
            id,
            instruction,
            ...(paths === undefined ? {} : { paths }),
        })
    );
});

// ============================================================================
// POST /content/:type/:id/generate
// ============================================================================

router.post('/:type/:id/generate', async (c) => {
    const { type, id } = c.req.param();
    const denied = guard(c, type, contentContract.generate);
    if (denied) return denied;

    const parsed = contentContract.generate.input.safeParse({
        ...((await readJson(c)) as object),
        type,
        id,
    });
    if (!parsed.success) return fromZodError(c, parsed.error);

    const { instruction, paths } = parsed.data;
    return run(c, () =>
        Astromech.content.generate({
            type,
            id,
            instruction,
            ...(paths === undefined ? {} : { paths }),
        })
    );
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Both halves of the gate, plus the type's existence. A content operation
 * mutates an entry, so the `content:*` permission the contract declares is
 * only half of what the caller needs — the other half is the same
 * `entryPermission(type, 'update')` the entries routes check.
 */
function guard(
    c: Context<Env>,
    type: string,
    contract: ServiceMethodContract
): Response | null {
    const permissions = permissionsFor(c.var.role);
    if (!permissions.allowsMethod(contract)) return forbidden(c);
    if (!permissions.allowsMethod(entryUpdateGate(type))) return forbidden(c);
    if (!resolveEntryType(Astromech.config, type)) {
        return notFound(c, `Entry type '${type}' not found`);
    }
    return null;
}

/** The target type's update permission, as a contract `allowsMethod` reads. */
function entryUpdateGate(type: string): ServiceMethodContract {
    return {
        permission: entryPermission(type, 'update') as Permission,
        mutates: true,
    };
}

/** A JSON body, or `{}` when there is none — the schema reports what is missing. */
async function readJson(c: Context<Env>): Promise<unknown> {
    try {
        return await c.req.json();
    } catch {
        return {};
    }
}

/**
 * Run an operation, answering 409 for a capability the type lacks and 400 for a
 * target the operation cannot act on. Anything else re-throws so `onError`
 * classifies it — a validation failure of the model's own output is a 422 there.
 */
async function run(
    c: Context<Env>,
    operation: () => Promise<ContentOperationResult>
): Promise<Response> {
    try {
        return c.json({ data: await operation() });
    } catch (err) {
        if (err instanceof CapabilityError) {
            return c.json(
                {
                    error: {
                        code: 'capability_not_supported',
                        message: err.message,
                        status: 409,
                    },
                },
                409
            );
        }
        if (err instanceof ContentOperationError) return badRequest(c, err.message);
        throw err;
    }
}

export { router as contentRouter };
