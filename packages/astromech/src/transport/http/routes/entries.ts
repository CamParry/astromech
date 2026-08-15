/**
 * Entry Routes
 *
 * Every entry type is served here, addressed by the type id the entries service
 * itself uses: bare (`post`) for a root type, qualified (`redirects/redirect`)
 * for a plugin type, URL-encoded into the `:type` segment. The id is passed to
 * the service verbatim, and the permission an action needs is derived from the
 * id's own shape — the single source that keeps plugin entries out of the
 * `entry:*` wildcard.
 *
 * The 30 routes are declared in `http-routes.shared.ts`; 24 of them get
 * their server handler from the map below. The six that cannot follow it, each
 * carrying the reason — they are still declared, still documented, and still
 * reachable by the fetch client.
 */

import { OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { Astromech } from '@/transport/local/index';
import {
    badRequest,
    forbidden,
    fromZodError,
    internalError,
    notFound,
    requestSchemaError,
} from '@/transport/http/middleware/errors';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import { PERMISSION_ENTRY_READ_FULL, entryPermission } from '@/permissions/index';
import { permissionsFor } from '@/permissions/permissions-for';
import type {
    EntryQueryParams,
    EntryUpdateData,
    JsonObject,
    ResolvedEntryType,
} from '@/types/index';
import {
    ENTRY_METHOD_ACTIONS,
    entryMethodContracts,
    type EntryMethodContract,
    type EntryMethodName,
} from '@/entries/methods';
import {
    createEntrySchemaFor,
    entrySortSchema,
    updateEntrySchema,
    updateEntrySchemaFor,
} from '@/entries/schema';
import { PublicTrashedReadError, StagedEntryExistsError } from '@/entries/errors';
import { resolveEntryType } from '@/entries/type-ids.shared';
import { ENTRIES_ROUTE_SPECS } from './http-routes.shared';
import {
    attachHandlers,
    documentBespokeRoutes,
    mountRestRoutes,
    type ContractCatalogue,
    type RestRoute,
} from './rest-route';

type Env = { Variables: AuthVariables };

/**
 * Build the entries router. There is exactly ONE in production; this is a
 * factory so tests can mount an isolated instance.
 *
 * The table mounts first: `DELETE /:type/trash` has to be matched before the
 * bespoke `DELETE /:type/:id` that would otherwise swallow it.
 */
export function createEntriesRouter(): OpenAPIHono<Env> {
    const router = new OpenAPIHono<Env>();
    const contracts = {
        forRequest: contractsForRequest,
        documented: DOCUMENTED_CONTRACTS,
    };
    mountRestRoutes(router, contracts, ENTRIES_ROUTES);
    documentBespokeRoutes(router, contracts, ENTRIES_ROUTE_SPECS);
    mountBespokeRoutes(router);
    return router;
}

// ============================================================================
// The handlers, one per generic row of ENTRIES_ROUTE_SPECS
// ============================================================================

/** The query string the list route accepts. `dir` is the only one that can fail. */
const listQuery = z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    trashed: z.string().optional(),
    full: z.string().optional(),
    locale: z.string().optional().openapi({ example: 'en' }),
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
        mapError: publicTrashedRead,
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
        mapError: publicTrashedRead,
    },
    'post /:type/bulk-trash': { args: bulkArgs, precondition: entryAccess() },
    'post /:type/bulk-delete': { args: bulkArgs, precondition: entryAccess() },
    'post /:type/bulk-restore': { args: bulkArgs, precondition: entryAccess() },
    'post /:type/bulk-publish': { args: bulkArgs, precondition: entryAccess() },
    'post /:type/bulk-unpublish': { args: bulkArgs, precondition: entryAccess() },
    'post /:type/bulk-schedule': { args: bulkArgs, precondition: entryAccess() },
    'post /:type/:id/restore': { args: canonicalArgs, precondition: entryAccess() },
    'post /:type/:id/duplicate': {
        args: async (c) => ({ ...canonicalArgs(c), overrides: await optionalBody(c) }),
        precondition: entryAccess(),
    },
    'delete /:type/trash': {
        args: (c) => ({ type: param(c, 'type') }),
        precondition: entryAccess(),
    },
    'delete /:type/:id/force': {
        args: (c) => ({ ...canonicalArgs(c), cascadeLocales: cascadeLocales(c) }),
        precondition: entryAccess(),
    },
    'post /:type/:id/publish': { args: canonicalArgs, precondition: entryAccess() },
    'post /:type/:id/unpublish': { args: canonicalArgs, precondition: entryAccess() },
    'post /:type/:id/schedule': {
        args: async (c) => ({ ...(await c.req.json()), ...canonicalArgs(c) }),
        precondition: entryAccess(),
    },
    // `versions` and `restoreVersion` declare `requires: 'versioning'` that these
    // routes have never enforced — honouring it would add a 409 to an unversioned
    // type, which answers 200 with an empty list today.
    'get /:type/:id/versions': {
        args: canonicalArgs,
        precondition: entryAccess('unchecked'),
    },
    'post /:type/:id/versions/:versionId/restore': {
        args: (c) => ({ ...canonicalArgs(c), versionId: param(c, 'versionId') }),
        precondition: entryAccess('unchecked'),
    },
    'get /:type/:id/incoming-relationships': {
        args: canonicalArgs,
        precondition: entryAccess(),
    },
    // Forward versioning (staged entries). Each is gated on the `staging`
    // capability its contract declares, so a misconfigured type answers 409
    // rather than the service's 500.
    'get /:type/:id/staged': { args: canonicalArgs, precondition: entryAccess() },
    'post /:type/:id/staged/merge': { args: canonicalArgs, precondition: entryAccess() },
    'delete /:type/:id/staged': { args: canonicalArgs, precondition: entryAccess() },
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

// ============================================================================
// Arguments
// ============================================================================

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
    if (sort) params.sort = { [sort]: q['dir'] === 'asc' ? 'asc' : 'desc' };
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
        ...(q['staged'] === 'true' || q['staged'] === '1' ? { staged: true } : {}),
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

/** A JSON body that need not be there — an absent one means "no options". */
async function optionalBody(c: Context<Env>): Promise<Record<string, unknown>> {
    return c.req.json<Record<string, unknown>>().catch(() => ({}));
}

/** The `cascadeLocales` flag, as the delete routes spell it on the query string. */
function cascadeLocales(c: Context<Env>): boolean {
    const value = c.req.query('cascadeLocales');
    return value === 'true' || value === '1';
}

// ============================================================================
// Contracts and preconditions
// ============================================================================

/** One entry type's method catalogue, built once per resolved type. */
const CONTRACTS_BY_TYPE = new WeakMap<
    ResolvedEntryType,
    Record<string, EntryMethodContract>
>();

/**
 * The catalogue the OpenAPI document is written from. REST addresses a type by
 * path param, so the document describes `{type}` rather than any one type, and
 * the titled schemas are the documented default.
 */
const DOCUMENTED_CONTRACTS: ContractCatalogue = Object.fromEntries(
    entryMethodContracts({ typeId: '{type}', titleField: 'title' }).map((contract) => [
        contract.method,
        contract,
    ])
);

/** The method catalogue for `resolved`, addressed as `typeId`. */
function entryContracts(
    resolved: ResolvedEntryType,
    typeId: string
): Record<string, EntryMethodContract> {
    const cached = CONTRACTS_BY_TYPE.get(resolved);
    if (cached) return cached;

    const catalogue: Record<string, EntryMethodContract> = {};
    for (const contract of entryMethodContracts({
        typeId,
        titleField: resolved.titleField,
    })) {
        catalogue[contract.method] = contract;
    }
    CONTRACTS_BY_TYPE.set(resolved, catalogue);
    return catalogue;
}

/** Resolve the catalogue for one request — the entry type is a path param. */
function contractsForRequest(c: Context<Env>): ContractCatalogue | undefined {
    const type = param(c, 'type');
    const resolved = resolveEntryType(Astromech.config, type);
    return resolved ? entryContracts(resolved, type) : undefined;
}

/**
 * The three checks an entries route makes before its body is read: the
 * per-(type, action) permission, the type's existence, then the capability the
 * method's contract requires.
 *
 * The permission is READ here, not enforced here — `scopedServices` refuses the
 * call whatever this returns. What it decides is the ORDER: an unknown type
 * answers 403 to an under-privileged role and 404 to a privileged one, so a
 * caller cannot enumerate the entry types it has no grant for. No contract can
 * stand in for it, because an unresolved type has none. `capability: 'unchecked'`
 * is the one exception, named at its two call sites.
 */
function entryAccess(
    capability: 'declared' | 'unchecked' = 'declared'
): (c: Context<Env>, route: RestRoute) => Response | null {
    return (c, route) => {
        const method = route.id.slice(route.id.indexOf('.') + 1) as EntryMethodName;
        return entryPrecondition(c, method, capability);
    };
}

/** {@link entryAccess}, for the bespoke handlers that make the same checks. */
function entryPrecondition(
    c: Context<Env>,
    method: EntryMethodName,
    capability: 'declared' | 'unchecked' = 'declared'
): Response | null {
    const type = param(c, 'type');
    const action = ENTRY_METHOD_ACTIONS[method];
    if (!permissionsFor(c.var.role).allows(entryPermission(type, action))) {
        return forbidden(c);
    }

    const resolved = resolveEntryType(Astromech.config, type);
    if (!resolved) return notFound(c, `Entry type '${type}' not found`);
    if (capability === 'unchecked') return null;

    const requires = entryContracts(resolved, type)[method]?.requires;
    if (requires !== undefined && !resolved.capabilities[requires]) {
        return capabilityDenied(c, type, requires);
    }
    return null;
}

/**
 * A public `trashed` read is a caller bug — a public read never returns trashed
 * rows — so it answers 400 rather than the catch-all 500. Every other failure is
 * left to `onError`, which would otherwise turn a `ValidationError` into a 500.
 */
function publicTrashedRead(error: unknown, c: Context<Env>): Response | null {
    return error instanceof PublicTrashedReadError ? badRequest(c, error.message) : null;
}

/** The 409 a method gated on a capability the entry type lacks answers with. */
function capabilityDenied(c: Context<Env>, type: string, capability: string): Response {
    return c.json(
        {
            error: {
                code: 'capability_not_supported',
                message: `Entry type "${type}" does not support capability: ${capability}`,
                status: 409,
            },
        },
        409
    );
}

/** The per-field capability gate shared by create, update and bulk-update. */
function fieldCapabilitiesDenied(
    c: Context<Env>,
    type: string,
    resolved: ResolvedEntryType,
    data: { status?: unknown; publishAt?: unknown; slug?: unknown }
): Response | null {
    const caps = resolved.capabilities;
    if (!caps.statuses && (data.status !== undefined || data.publishAt !== undefined)) {
        return capabilityDenied(c, type, 'statuses');
    }
    if (!caps.slug && data.slug !== undefined) return capabilityDenied(c, type, 'slug');
    return null;
}

// ============================================================================
// Bespoke handlers
// ============================================================================

const bulkUpdateSchema = z.object({
    ids: z.array(z.string().min(1)).min(1),
    data: updateEntrySchema,
});

/** The six handlers the table cannot express, each with the reason. */
function mountBespokeRoutes(router: OpenAPIHono<Env>): void {
    // ========================================================================
    // POST /entries/query  (cross-type)
    // ========================================================================

    // Not in the table: `type` arrives in the body and may be a list, and an
    // absent one answers a hand-rolled `invalid_input` 400 outside ApiErrorCode.
    router.post('/query', async (c) => {
        const permissions = permissionsFor(c.var.role);
        const body = await c.req.json<EntryQueryParams & Record<string, unknown>>();
        const typeParam = body.type;
        const types = Array.isArray(typeParam)
            ? Array.from(typeParam)
            : typeParam
              ? [typeParam as string]
              : [];

        if (types.length === 0) {
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
            if (!resolveEntryType(Astromech.config, type)) {
                return notFound(c, `Entry type '${type}' not found`);
            }
        }

        const wantsFull = body['full'] === true;
        if (wantsFull && !permissions.allows(PERMISSION_ENTRY_READ_FULL)) {
            return forbidden(c);
        }

        const sort = entrySortSchema.parse(body.sort);
        try {
            return c.json(
                await Astromech.entries.query({
                    ...body,
                    type: types,
                    full: wantsFull,
                    ...(sort !== undefined ? { sort } : {}),
                })
            );
        } catch (error) {
            return publicTrashedRead(error, c) ?? raise(error);
        }
    });

    // ========================================================================
    // POST /entries/:type
    // ========================================================================

    // Not in the table: a per-FIELD capability 409 — `status`/`publishAt` need
    // `statuses` and `slug` needs `slug`, which no contract states.
    router.post('/:type', async (c) => {
        const { type } = c.req.param();
        const denied = entryPrecondition(c, 'create');
        if (denied) return denied;

        const resolved = resolveEntryType(Astromech.config, type) as ResolvedEntryType;
        const raw = await c.req.json().catch(() => undefined);
        if (raw === undefined) return badRequest(c, 'Invalid JSON body');

        const parsed = createEntrySchemaFor(resolved.titleField).safeParse(raw);
        // The per-type body schema answers the same envelope OpenAPIHono's
        // request validator did, so a titled type behaves as it always has.
        if (!parsed.success) return requestSchemaError(c, parsed.error);

        const refused = fieldCapabilitiesDenied(c, type, resolved, parsed.data);
        if (refused) return refused;

        const { title, slug, fields, status, publishAt, locale, localeGroup } =
            parsed.data;

        const entry = await Astromech.entries.create({
            type,
            ...(title !== undefined && { title }),
            ...(slug !== undefined && { slug }),
            ...(locale !== undefined && { locale }),
            ...(localeGroup !== undefined && { localeGroup }),
            ...(fields !== undefined && { fields: fields as JsonObject }),
            ...(status !== undefined && { status }),
            ...(publishAt !== undefined && { publishAt }),
        });

        return c.json({ data: entry }, 201);
    });

    // ========================================================================
    // POST /entries/:type/bulk-update
    // ========================================================================

    // Not in the table: the per-field capability 409, plus `status: 'published'`
    // demanding the publish permission on an update method.
    router.post('/:type/bulk-update', async (c) => {
        const { type } = c.req.param();
        const denied = entryPrecondition(c, 'update');
        if (denied) return denied;

        const resolved = resolveEntryType(Astromech.config, type) as ResolvedEntryType;
        const raw = await c.req.json().catch(() => undefined);
        if (raw === undefined) return badRequest(c, 'Invalid JSON body');

        const parsed = bulkUpdateSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { ids, data } = parsed.data;
        const refused = fieldCapabilitiesDenied(c, type, resolved, data);
        if (refused) return refused;

        const escalated = publishEscalation(c, type, data.status);
        if (escalated) return escalated;

        const entries = await Astromech.entries.update({
            type,
            id: ids,
            data: data as EntryUpdateData,
        });
        return c.json({ data: entries });
    });

    // ========================================================================
    // PUT /entries/:type/:id
    // ========================================================================

    // Not in the table: the same per-field capability 409 and publish escalation.
    router.put('/:type/:id', async (c) => {
        const { type, id } = c.req.param();
        const denied = entryPrecondition(c, 'update');
        if (denied) return denied;

        const resolved = resolveEntryType(Astromech.config, type) as ResolvedEntryType;
        const raw = await c.req.json().catch(() => undefined);
        if (raw === undefined) return badRequest(c, 'Invalid JSON body');

        // Two stages, as this route has always had: the request schema the
        // document declares answers 400, and the per-type schema answers 422.
        const envelope = updateEntrySchemaFor(false).safeParse(raw);
        if (!envelope.success) return requestSchemaError(c, envelope.error);

        const parsed = updateEntrySchemaFor(resolved.titleField).safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const refused = fieldCapabilitiesDenied(c, type, resolved, parsed.data);
        if (refused) return refused;

        const escalated = publishEscalation(c, type, parsed.data.status);
        if (escalated) return escalated;

        const { title, slug, fields, status, publishAt } = parsed.data;
        const entry = await Astromech.entries.update({
            type,
            id,
            data: {
                ...(title !== undefined && { title }),
                ...(slug !== undefined && { slug }),
                ...(fields !== undefined && { fields: fields as JsonObject }),
                ...(status !== undefined && { status }),
                ...(publishAt !== undefined && { publishAt }),
            },
        });

        return c.json({ data: entry });
    });

    // ========================================================================
    // DELETE /entries/:type/:id  (soft delete)
    // ========================================================================

    // Not in the table: the method id is chosen at request time from the type's
    // `trash` capability — trash it if the type keeps a bin, delete it if not.
    router.delete('/:type/:id', async (c) => {
        const { type, id } = c.req.param();
        const denied = entryPrecondition(c, 'delete');
        if (denied) return denied;

        const resolved = resolveEntryType(Astromech.config, type) as ResolvedEntryType;
        const call = resolved.capabilities.trash
            ? Astromech.entries.trash
            : Astromech.entries.delete;
        await call({ type, id, cascadeLocales: cascadeLocales(c) });
        return c.json({ success: true });
    });

    // ========================================================================
    // POST /entries/:type/:id/staged
    // ========================================================================

    // Not in the table: `StagedEntryExistsError` answers a 409 carrying
    // `details.stagedId`, and a catch-all turns every other throw into a 500
    // instead of letting `onError` classify it.
    router.post('/:type/:id/staged', async (c) => {
        const { type, id } = c.req.param();
        const denied = entryPrecondition(c, 'createStaged');
        if (denied) return denied;

        try {
            const entry = await Astromech.entries.createStaged({ type, id });
            return c.json({ data: entry }, 201);
        } catch (error) {
            if (error instanceof StagedEntryExistsError) {
                // The 409 carries the existing staged id so the admin can redirect.
                return c.json(
                    {
                        error: {
                            code: 'staged_entry_exists',
                            message: error.message,
                            status: 409,
                            details: { stagedId: error.stagedId },
                        },
                    },
                    409
                );
            }
            return internalError(c, error instanceof Error ? error.message : undefined);
        }
    });
}

/**
 * Publishing through an update. `scopedServices` derives `entry:<type>:update`
 * from the method, and cannot see that this particular payload makes the entry
 * live — so the publish grant is demanded here.
 */
function publishEscalation(
    c: Context<Env>,
    type: string,
    status: string | undefined
): Response | null {
    if (status !== 'published') return null;
    return permissionsFor(c.var.role).allows(entryPermission(type, 'publish'))
        ? null
        : forbidden(c);
}

/** Re-throw, as an expression, so a declined error map reads as one line. */
function raise(error: unknown): never {
    throw error;
}

/** The entries router, mounted at `/entries`. Serves every entry type. */
export const entriesRouter = createEntriesRouter();
