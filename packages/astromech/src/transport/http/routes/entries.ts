/**
 * Entry Routes
 *
 * Every entry type is served here, addressed by the type id the entries
 * service itself uses — bare for a root type, qualified for a plugin type.
 * The 30 routes live in `http-routes.ts`; two get a bespoke handler.
 */
import type { ContractCatalogue, RestRoute } from './rest-route';
import type { EntryMethodName } from '@/entries/catalogue';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { EntryQueryParams, ResolvedEntryType, SortDirection } from '@/types/index';
import type { Context } from 'hono';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { getConfig } from '@/config/registry';
import { entryCatalogue } from '@/entries/catalogue';
import { resolveEntryType } from '@/entries/entry-types';
import { createEntrySchema, updateEntrySchema } from '@/entries/schema';
import { entriesDefinition } from '@/entries/service';
import { resolveAccess } from '@/permissions/access';
import { PERMISSION_ENTRY_READ_FULL } from '@/permissions/core-permissions';
import { entryPermission } from '@/permissions/entry-permission';
import { permissionsFor } from '@/permissions/permissions-for';
import { badRequest, forbidden, notFound } from '@/transport/http/middleware/errors';
import { ENTRIES_ROUTE_SPECS } from './http-routes';
import { attachHandlers, documentBespokeRoutes, mountRestRoutes } from './rest-route';

type Env = { Variables: AuthVariables };

/**
 * Build the entries router. There is exactly ONE in production; this is a
 * factory so tests can mount an isolated instance.
 *
 * Hono matches in registration order, so the cross-type `POST /query` mounts
 * before the table's `POST /:type` would take it, and the table before the
 * bespoke `DELETE /:type/:id` would swallow `DELETE /:type/trash`.
 */
export function createEntriesRouter(): OpenAPIHono<Env> {
    const router = new OpenAPIHono<Env>();
    mountCrossTypeQuery(router);
    mountRestRoutes(router, DOCUMENTED_CONTRACTS, ENTRIES_ROUTES);
    documentBespokeRoutes(router, DOCUMENTED_CONTRACTS, ENTRIES_ROUTE_SPECS);
    mountTrashOrDelete(router);
    return router;
}

// The handlers, one per generic row of ENTRIES_ROUTE_SPECS.

/** The query string the list route accepts. `dir` is the only one that can fail. */
const listQuery = z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    trashed: z.string().optional(),
    full: z.string().optional(),
    locale: z.string().optional(),
    sort: z.string().optional(),
    dir: z.enum(['asc', 'desc']).optional(),
    previewToken: z.string().optional(),
    staged: z.string().optional(),
});

/** The query string the single-entry read accepts. */
const entryQuery = z.object({
    locale: z.string().optional(),
    full: z.string().optional(),
    previewToken: z.string().optional(),
    staged: z.string().optional(),
});

export const ENTRIES_ROUTES: RestRoute[] = attachHandlers(ENTRIES_ROUTE_SPECS, {
    'get /:type': {
        args: listArgs,
        query: listQuery,
        precondition: entryAccess(),
    },
    'get /:type/:id': {
        args: getArgs,
        query: entryQuery,
        precondition: entryAccess(),
        notFound: (c) => `Entry '${c.req.param('id')}' not found`,
    },
    'post /:type/query': {
        args: queryBodyArgs,
        precondition: entryAccess(),
    },
    // The documented body is the type's own create schema, so a titled type
    // with no title answers the validator's 400 before the method runs.
    'post /:type': {
        args: async (c) => ({ type: param(c, 'type'), data: await c.req.json() }),
        body: (c) => createEntrySchema({ titled: isTitled(c) }),
        precondition: entryAccess(),
    },
    'post /:type/bulk-update': {
        args: async (c) => ({ ...(await localisedBulkArgs(c)), ...stagedArg(c) }),
        precondition: entryAccess(),
    },
    // `locale` addresses which translation is written, and a locale with no
    // content row yet is created; `staged` writes the staged change. The
    // documented body is the titleless envelope; a titled type's empty title is
    // the method's 422.
    'put /:type/:id': {
        args: async (c) => ({
            ...contentArgs(c),
            ...stagedArg(c),
            data: await c.req.json(),
        }),
        body: () => updateEntrySchema({ titled: false }),
        precondition: entryAccess(),
    },
    'post /:type/bulk-trash': { args: bulkArgs, precondition: entryAccess() },
    'post /:type/bulk-delete': { args: bulkArgs, precondition: entryAccess() },
    'post /:type/bulk-restore': { args: bulkArgs, precondition: entryAccess() },
    'post /:type/bulk-publish': { args: localisedBulkArgs, precondition: entryAccess() },
    'post /:type/bulk-unpublish': {
        args: localisedBulkArgs,
        precondition: entryAccess(),
    },
    'post /:type/bulk-schedule': {
        args: localisedBulkArgs,
        precondition: entryAccess(),
    },
    'post /:type/:id/restore': { args: canonicalArgs, precondition: entryAccess() },
    'post /:type/:id/duplicate': {
        args: async (c) => ({ ...canonicalArgs(c), overrides: await optionalBody(c) }),
        precondition: entryAccess(),
    },
    'delete /:type/trash': {
        args: (c) => ({ type: param(c, 'type') }),
        precondition: entryAccess(),
    },
    'delete /:type/:id/force': { args: canonicalArgs, precondition: entryAccess() },
    'post /:type/:id/publish': { args: contentArgs, precondition: entryAccess() },
    'post /:type/:id/unpublish': { args: contentArgs, precondition: entryAccess() },
    'post /:type/:id/schedule': {
        args: async (c) => ({ ...(await c.req.json()), ...contentArgs(c) }),
        precondition: entryAccess(),
    },
    // Version history. Both declare `requires: 'versioning'`, so an unversioned
    // type answers 409 like every other capability-gated route.
    'get /:type/:id/versions': {
        args: contentArgs,
        precondition: entryAccess(),
    },
    'post /:type/:id/versions/:versionId/restore': {
        args: (c) => ({ ...contentArgs(c), versionId: param(c, 'versionId') }),
        precondition: entryAccess(),
    },
    'get /:type/:id/used-by': {
        args: canonicalArgs,
        precondition: entryAccess(),
    },
    // Forward versioning (staged entries). Each is gated on the `staging`
    // capability its contract declares, so a misconfigured type answers 409
    // rather than the service's 500.
    'post /:type/:id/staged': { args: contentArgs, precondition: entryAccess() },
    'get /:type/:id/staged': { args: contentArgs, precondition: entryAccess() },
    'post /:type/:id/staged/merge': { args: contentArgs, precondition: entryAccess() },
    'delete /:type/:id/staged': { args: contentArgs, precondition: entryAccess() },
    'post /:type/:id/preview-token': {
        args: async (c) => ({
            ...canonicalArgs(c),
            expiresAt: (await optionalBody(c))['expiresAt'] ?? null,
        }),
        precondition: entryAccess(),
    },
    'delete /:type/:id/preview-token': {
        args: canonicalArgs,
        precondition: entryAccess(),
    },
});

/**
 * A path param the route has already matched. A bare `Context` cannot say which
 * params a path declares, so the type is widened and narrowed back here.
 */
function param(c: Context<Env>, name: string): string {
    return c.req.param(name) ?? '';
}

/** The `{ type, id }` every single-entry method takes. */
function canonicalArgs(c: Context<Env>): { type: string; id: string } {
    return { type: param(c, 'type'), id: param(c, 'id') };
}

/**
 * {@link canonicalArgs} plus the locale a content-level route addresses. An
 * absent one leaves the service to fill in the default content locale.
 */
function contentArgs(c: Context<Env>): { type: string; id: string; locale?: string } {
    const locale = c.req.query('locale');
    return { ...canonicalArgs(c), ...(locale ? { locale } : {}) };
}

/** `{ staged: true }` when the query string asks for the staged change. */
function stagedArg(c: Context<Env>): { staged?: true } {
    return flag(c, 'staged') ? { staged: true } : {};
}

/** Whether the route's entry type carries a title. The precondition has resolved it. */
function isTitled(c: Context<Env>): boolean {
    return resolveEntryType(getConfig(), param(c, 'type'))?.titleField !== false;
}

/** A boolean query flag, in the two spellings the wire has always accepted. */
function flag(c: Context<Env>, name: string): boolean {
    const value = c.req.query(name);
    return value === 'true' || value === '1';
}

/** `entries.query` arguments, read off the query string. */
function listArgs(c: Context<Env>): EntryQueryParams & { type: string } {
    const q = c.req.query();
    const params: EntryQueryParams & { type: string } = {
        type: param(c, 'type'),
        full: q['full'] === 'true',
    };
    if (q['locale']) params.locale = q['locale'];
    if (q['trashed'] === 'true') params.trashed = true;
    if (q['search']) params.search = q['search'];
    if (q['page']) params.page = Number(q['page']);
    if (q['limit'] === 'all') params.limit = 'all';
    else if (q['limit']) params.limit = Number(q['limit']);
    const sort = q['sort'];
    // `dir` is already 'asc' or 'desc' — the route schema 400s anything else.
    if (sort) params.sort = { [sort]: (q['dir'] as SortDirection | undefined) ?? 'desc' };
    // Forward versioning: a preview token bypasses the publish gate for the
    // matched canonical (or its staged change with `staged`). Public shape only.
    if (q['previewToken']) params.previewToken = q['previewToken'];
    if (q['staged'] === 'true' || q['staged'] === '1') params.staged = true;
    return params;
}

/** `entries.get` arguments, read off the query string. */
function getArgs(c: Context<Env>): Record<string, unknown> {
    const q = c.req.query();
    return {
        ...canonicalArgs(c),
        full: q['full'] === 'true',
        ...(q['locale'] ? { locale: q['locale'] } : {}),
        ...(q['previewToken'] ? { previewToken: q['previewToken'] } : {}),
        ...(flag(c, 'staged') ? { staged: true } : {}),
    };
}

/** `entries.query` arguments, read off a JSON body. Type pinned last. */
async function queryBodyArgs(c: Context<Env>): Promise<Record<string, unknown>> {
    const body = await c.req.json<Record<string, unknown>>();
    return { ...body, type: param(c, 'type'), full: body['full'] === true };
}

/** A bulk route's arguments: the wire's `ids` list is the method's `id`. */
async function bulkArgs(c: Context<Env>): Promise<Record<string, unknown>> {
    const body = await c.req.json<Record<string, unknown>>();
    return { ...body, type: param(c, 'type'), id: body['ids'] };
}

/** {@link bulkArgs} for the bulk routes that address one locale of each entry. */
async function localisedBulkArgs(c: Context<Env>): Promise<Record<string, unknown>> {
    const locale = c.req.query('locale');
    return { ...(await bulkArgs(c)), ...(locale ? { locale } : {}) };
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

/** A JSON body that need not be there — an absent one means "no options". */
async function optionalBody(c: Context<Env>): Promise<Record<string, unknown>> {
    return c.req.json<Record<string, unknown>>().catch(() => ({}));
}

/**
 * The catalogue the OpenAPI document is written from. REST addresses a type by
 * path param, so the document describes `{type}` rather than any one type, and
 * the titled schemas are the documented default.
 */
const DOCUMENTED_CONTRACTS: ContractCatalogue = entryCatalogue({
    typeId: '{type}',
    titled: true,
});

/**
 * The two checks an entries route makes before its body is read: the
 * per-(type, action) permission, then the type's existence. The capability a
 * method requires is the method's own check.
 *
 * The permission is READ here, not enforced here — the scoped handle refuses the
 * call whatever this returns. What it decides is the ORDER: an unknown type
 * answers 403 to an under-privileged role and 404 to a privileged one, so a
 * caller cannot enumerate the entry types it has no grant for. No contract can
 * stand in for it, because an unresolved type has none.
 */
function entryAccess(): (c: Context<Env>, route: RestRoute) => Response | null {
    return (c, route) => {
        const method = route.id.slice(route.id.indexOf('.') + 1) as EntryMethodName;
        return entryPrecondition(c, method);
    };
}

/** {@link entryAccess}, for the bespoke handlers that make the same checks. */
function entryPrecondition(c: Context<Env>, method: EntryMethodName): Response | null {
    const type = param(c, 'type');
    const declared = entriesDefinition.catalogue[method];
    if (
        !permissionsFor(c.var.ctx.role).allowsAccess(
            resolveAccess(declared.access, { type })
        )
    )
        return forbidden(c);

    if (!resolveEntryType(getConfig(), type)) {
        return notFound(c, `Entry type '${type}' not found`);
    }
    return null;
}

/** The cross-type query, which the table cannot express. */
function mountCrossTypeQuery(router: OpenAPIHono<Env>): void {
    // POST /entries/query (cross-type)
    // Not in the table: `type` arrives in the body and may be a list, and an
    // absent one answers a hand-rolled `invalid_input` 400 outside ApiErrorCode.
    // The rest of the body is the method's to parse, so a bad field is its 422.
    router.post('/query', async (c) => {
        const permissions = permissionsFor(c.var.ctx.role);
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

        for (const type of types) {
            // Permission before existence, as on every entries route: a 404 an
            // unpermitted caller can read is a type enumeration.
            if (!permissions.allows(entryPermission(type, 'read'))) return forbidden(c);
            if (!resolveEntryType(getConfig(), type)) {
                return notFound(c, `Entry type '${type}' not found`);
            }
        }

        const wantsFull = (body as Record<string, unknown>)['full'] === true;
        if (wantsFull && !permissions.allows(PERMISSION_ENTRY_READ_FULL)) {
            return forbidden(c);
        }

        return c.json(
            await c.var.ctx.entries.query({
                ...(body as EntryQueryParams),
                type: types,
                full: wantsFull,
            })
        );
    });
}

/** The soft delete, which the table cannot express. */
function mountTrashOrDelete(router: OpenAPIHono<Env>): void {
    // DELETE /entries/:type/:id (soft delete)
    // Not in the table: the method id is chosen at request time from the type's
    // `trash` capability — trash it if the type keeps a bin, delete it if not.
    router.delete('/:type/:id', async (c) => {
        const { type, id } = c.req.param();
        const denied = entryPrecondition(c, 'delete');
        if (denied) return denied;

        const resolved = resolveEntryType(getConfig(), type) as ResolvedEntryType;
        const { entries } = c.var.ctx;
        await (resolved.capabilities.trash ? entries.trash : entries.delete)({
            type,
            id,
        });
        return c.json({ success: true });
    });
}

/** The entries router, mounted at `/entries`. Serves every entry type. */
export const entriesRouter = createEntriesRouter();
