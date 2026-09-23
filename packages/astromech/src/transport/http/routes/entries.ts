/**
 * Entry Routes
 *
 * Every entry type is served here, addressed by the type id the entries
 * service itself uses — bare for a root type, qualified for a plugin type.
 * The routes are rows in `http-routes.ts`; one gets a bespoke handler.
 */
import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { EntryQueryParams } from '@/types/index';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createServices } from '@/app-context/services';
import { entryCatalogue } from '@/entries/catalogue';
import { entriesDefinition } from '@/entries/service';
import { badRequest } from '@/transport/http/middleware/errors';
import { ENTRIES_ROUTE_SPECS } from './http-routes';
import { mountRestRoutes } from './rest-route';
import { missingEntryType, routeAccess } from './route-access';

type Env = { Variables: AuthVariables };

/**
 * Build the entries router. There is exactly ONE in production; this is a
 * factory so tests can mount an isolated instance.
 *
 * Hono matches in registration order, so the cross-type `POST /query` mounts
 * before the table's `POST /:type` would take it.
 */
export function createEntriesRouter(): OpenAPIHono<Env> {
    const router = new OpenAPIHono<Env>();
    mountCrossTypeQuery(router);
    mountRestRoutes(router, {
        catalogue: entriesDefinition.catalogue,
        // REST addresses a type by path param, so the document describes
        // `{type}` rather than any one type, with the titled schemas as default.
        documented: entryCatalogue({ typeId: '{type}', titled: true }),
        specs: ENTRIES_ROUTE_SPECS,
        missingTarget: missingEntryType,
    });
    return router;
}

/**
 * The entry types a cross-type query body names: a non-empty string, or a
 * non-empty list of them. Null for anything else, the body itself included.
 */
function bodyTypes(body: unknown): string[] | null {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    const type = (body as { type?: unknown }).type;
    const types = Array.isArray(type) ? (type as unknown[]) : [type];
    if (types.length === 0) return null;
    return types.every((t) => typeof t === 'string' && t.length > 0)
        ? (types as string[])
        : null;
}

/** The cross-type query, which the table cannot express. */
function mountCrossTypeQuery(router: OpenAPIHono<Env>): void {
    // POST /entries/query (cross-type)
    // Not in the table: `type` arrives in the body and may be a list, and an
    // absent one answers a hand-rolled `invalid_input` 400 outside ApiErrorCode.
    // The rest of the body is the method's to parse, so a bad field is its 422.
    router.post('/query', async (c) => {
        const body = await c.req.json<unknown>().catch(() => undefined);
        if (body === undefined) return badRequest(c, 'Invalid JSON body');
        const types = bodyTypes(body);

        if (types === null) {
            return c.json(
                {
                    error: {
                        code: 'invalid_input',
                        message: '`type` is required (string or string[])',
                        status: 400,
                    },
                },
                400
            );
        }

        // Each type in turn, so a type the caller has no grant for answers 403
        // before a later one's 404.
        const full = (body as Record<string, unknown>)['full'] === true;
        for (const type of types) {
            const denied = routeAccess(
                c,
                entriesDefinition.catalogue.query.access,
                { type, full },
                missingEntryType
            );
            if (denied) return denied;
        }

        const { entries } = createServices(c.var.ctx, { overrideAccess: false });
        return c.json(
            await entries.query({
                ...(body as EntryQueryParams),
                type: types,
                full,
            })
        );
    });
}

/** The entries router, mounted at `/entries`. Serves every entry type. */
export const entriesRouter = createEntriesRouter();
