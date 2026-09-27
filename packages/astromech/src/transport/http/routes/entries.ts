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
import { ValidationError } from '@/errors/validation';
import { badRequest, fromZodError } from '@/transport/http/middleware/errors';
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
    // A route addressing a type by path param is documented for `{type}` rather
    // than any one type, with the titled schemas as default; the cross-type
    // query names its types in the body, as the method's own input does.
    const typed = entryCatalogue({ typeId: '{type}', titled: true });
    mountRestRoutes(router, {
        catalogue: entriesDefinition.catalogue,
        documented: (route) =>
            route.path.includes(':type') ? typed : entriesDefinition.catalogue,
        specs: ENTRIES_ROUTE_SPECS,
        missingTarget: missingEntryType,
    });
    return router;
}

/**
 * The entry types a cross-type query body names: a non-empty string, or a
 * non-empty list of them. Null for anything else.
 */
function bodyTypes(body: Record<string, unknown>): string[] | null {
    const type = body['type'];
    const types = Array.isArray(type) ? (type as unknown[]) : [type];
    if (types.length === 0) return null;
    return types.every((t) => typeof t === 'string' && t.length > 0)
        ? (types as string[])
        : null;
}

/** The cross-type query, which the table cannot express. */
function mountCrossTypeQuery(router: OpenAPIHono<Env>): void {
    // POST /entries/query (cross-type)
    // Not in the table: `type` arrives in the body and may be a list, and each
    // type's permission is checked before the method runs, so `type` is read
    // here. A missing or malformed one is an input failure like any other, and
    // the rest of the body is the method's to parse.
    router.post('/query', async (c) => {
        const body = await c.req.json<unknown>().catch(() => undefined);
        if (body === undefined) return badRequest(c, 'Invalid JSON body');
        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
            return badRequest(c, 'The request body must be a JSON object');
        }
        const types = bodyTypes(body as Record<string, unknown>);
        if (types === null) {
            const refused = ValidationError.fromFieldErrors({
                type: ['Expected an entry type id, or a non-empty list of them'],
            });
            return fromZodError(c, refused);
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
