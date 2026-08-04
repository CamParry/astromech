/**
 * Entry Routes
 *
 * Full CRUD operations for collection entries — type-scoped routes,
 * bulk-* sub-routes.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Astromech } from '@/transport/local/index.js';
import {
    badRequest,
    forbidden,
    fromZodError,
    internalError,
    notFound,
} from '@/transport/http/middleware/errors.js';
import type { AuthVariables } from '@/transport/http/middleware/auth.js';
import {
    PERMISSION_ENTRY_READ_FULL,
    type EntryAction,
    entryPermission,
} from '@/permissions/index.js';
import { permissionsFor } from '@/permissions/permissions-for.js';
import type {
    EntryDuplicateOverrides,
    EntryQueryParams,
    EntryUpdateData,
    JsonObject,
    Permission,
    ResolvedEntryTypeConfig,
    ServiceMethodContract,
    SortOption,
} from '@/types/index.js';
import {
    updateEntrySchema,
    createEntrySchemaFor,
    duplicateOverridesSchema,
    updateEntrySchemaFor,
    scheduleEntrySchema,
} from '@/entries/schema.js';
import { PublicTrashedReadError, StagedEntryExistsError } from '@/entries/errors.js';
import { resolveEntryType } from '@/entries/type-ids.js';

type Env = { Variables: AuthVariables };

// ============================================================================
// Router
// ============================================================================

/**
 * Build the entries router. There is exactly ONE — root and plugin entry types
 * are both served here, addressed by the type id the entries service itself
 * uses: bare (`post`) for a root type, qualified (`redirects/redirect`) for a
 * plugin type. A qualified id reaches the `:type` path param URL-encoded, which
 * the client does and Hono decodes.
 *
 * Nothing is namespaced on the way in or out: the type is passed through to the
 * entries service verbatim, and the permission an action checks is derived from
 * the id's own shape by `entryPermission` — the single source that keeps plugin
 * entries out of the `entry:*` wildcard.
 *
 * Response envelopes are passed through verbatim too: entries returned by the
 * entries service carry whatever `type` it assigns (the qualified id for built-in
 * storage, or `undefined` for `tableStorage`).
 *
 * Exported as a factory so tests can mount an isolated instance; production has
 * the single `entriesRouter` below.
 */
export function createEntriesRouter(): OpenAPIHono<Env> {
    const router = new OpenAPIHono<Env>();

    /**
     * Wrap the per-(type, action) permission as a method contract, so entries
     * are enforced through the same `permissionsFor(...).allowsMethod` seam as
     * every other service.
     */
    const entryGate = (type: string, action: EntryAction): ServiceMethodContract => ({
        permission: entryPermission(type, action) as Permission,
        mutates: action !== 'read',
        destructive: action === 'delete',
    });

    /** Resolve a type id against root entries (bare) or pluginEntries (qualified). */
    const lookup = (type: string): ResolvedEntryTypeConfig | undefined =>
        resolveEntryType(Astromech.config, type);

    // ============================================================================
    // Helpers
    // ============================================================================

    const SORTABLE_FIELDS = new Set([
        'title',
        'status',
        'createdAt',
        'updatedAt',
        'publishedAt',
        'slug',
    ]);

    function validateSort(sort: unknown): SortOption | SortOption[] | undefined {
        if (!sort) return undefined;
        const validate = (s: unknown): SortOption | null => {
            if (typeof s !== 'object' || s === null || Array.isArray(s)) return null;
            const result: SortOption = {};
            for (const [key, val] of Object.entries(s as Record<string, unknown>)) {
                if (!SORTABLE_FIELDS.has(key)) continue;
                if (val !== 'asc' && val !== 'desc') continue;
                result[key] = val;
            }
            return Object.keys(result).length > 0 ? result : null;
        };
        if (Array.isArray(sort)) {
            const results = sort.map(validate).filter(Boolean) as SortOption[];
            return results.length > 0 ? results : undefined;
        }
        return validate(sort) ?? undefined;
    }

    function parseQueryParams(
        query: Record<string, string>
    ): Omit<EntryQueryParams, 'type'> {
        const params: Omit<EntryQueryParams, 'type'> = {};

        const locale = query['locale'];
        if (locale) params.locale = locale;

        if (query['trashed'] === 'true') params.trashed = true;

        if (query['search']) params.search = query['search'];

        const page = query['page'];
        if (page) params.page = Number(page);

        const limit = query['limit'];
        if (limit === 'all') params.limit = 'all';
        else if (limit) params.limit = Number(limit);

        const sortField = query['sort'];
        if (sortField) {
            const dir = query['dir'] === 'asc' ? 'asc' : 'desc';
            if (SORTABLE_FIELDS.has(sortField)) {
                params.sort = { [sortField]: dir };
            }
        }

        // Forward versioning: a preview token bypasses the publish gate for the
        // matched canonical (or its staged change with `staged`). Public shape only.
        const previewToken = query['previewToken'];
        if (previewToken) params.previewToken = previewToken;
        if (query['staged'] === 'true' || query['staged'] === '1') params.staged = true;

        return params;
    }

    /** Parse the `full` flag from a GET query string. */
    function parseFullFromQuery(query: Record<string, string>): boolean {
        return query['full'] === 'true';
    }

    /** Parse the `full` flag from a POST JSON body. */
    function parseFullFromBody(body: Record<string, unknown>): boolean {
        return body['full'] === true;
    }

    function cascadeLocalesFromQuery(query: Record<string, string>): boolean {
        return query['cascadeLocales'] === 'true' || query['cascadeLocales'] === '1';
    }

    function requireEntryType(type: string) {
        if (!lookup(type)) return null;
        return type;
    }

    function getTypeCapabilities(type: string) {
        return lookup(type)?.capabilities;
    }

    function getTypeTitleField(type: string): 'title' | false {
        return lookup(type)?.titleField ?? 'title';
    }

    function capabilityDenied(
        c: Parameters<typeof forbidden>[0],
        type: string,
        capability: string
    ): Response {
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

    /**
     * Reproduce OpenAPIHono's default request-validation envelope. Body validation
     * is per-type (titled vs titleless), so it happens in the handler rather than
     * the route's static schema; titled types must still fail with the exact same
     * `{ success: false, error }` 400 they did when the route schema validated them.
     */
    function zodValidationError(
        c: Parameters<typeof forbidden>[0],
        err: z.ZodError
    ): Response {
        return c.json({ success: false, error: err }, 400);
    }

    /**
     * Run a query, answering 400 for a public `trashed` read. That is a caller
     * bug — a public read never returns trashed rows — so it does not deserve the
     * catch-all 500. Every other failure is re-thrown so `onError` classifies it;
     * a blanket catch here would turn a `ValidationError` back into a 500.
     */
    async function runQuery(
        c: Parameters<typeof forbidden>[0],
        params: EntryQueryParams & { type: string | readonly string[] }
    ): Promise<Response> {
        try {
            return c.json(await Astromech.entries.query(params));
        } catch (err) {
            if (err instanceof PublicTrashedReadError) return badRequest(c, err.message);
            throw err;
        }
    }

    const bulkIdsSchema = z.object({
        ids: z.array(z.string().min(1)).min(1),
    });

    const bulkUpdateSchema = z.object({
        ids: z.array(z.string().min(1)).min(1),
        data: updateEntrySchema,
    });

    const bulkScheduleSchema = z.object({
        ids: z.array(z.string().min(1)).min(1),
        publishAt: z.union([
            z.date(),
            z
                .string()
                .datetime({ offset: true })
                .transform((v) => new Date(v)),
        ]),
    });

    const bulkTrashOrDeleteSchema = z.object({
        ids: z.array(z.string().min(1)).min(1),
        cascadeLocales: z.boolean().optional(),
    });

    // ============================================================================
    // POST /entries/query  (cross-type)
    // Registered BEFORE any /:type/... route so it isn't shadowed.
    // ============================================================================

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

        for (const t of types) {
            if (!requireEntryType(t)) return notFound(c, `Entry type '${t}' not found`);
            if (!permissions.allowsMethod(entryGate(t, 'read'))) return forbidden(c);
        }

        const wantsFull = parseFullFromBody(body);
        if (wantsFull && !permissions.allows(PERMISSION_ENTRY_READ_FULL))
            return forbidden(c);

        const validatedSort = validateSort(body.sort);
        const params: EntryQueryParams & { type: string | readonly string[] } = {
            ...body,
            type: types,
            full: wantsFull,
            ...(validatedSort !== undefined ? { sort: validatedSort } : {}),
        };
        return runQuery(c, params);
    });

    // ============================================================================
    // GET /entries/:type
    // ============================================================================

    const listEntriesRoute = createRoute({
        method: 'get',
        path: '/{type}',
        request: {
            params: z.object({ type: z.string().openapi({ example: 'post' }) }),
            query: z.object({
                page: z.string().optional(),
                limit: z.string().optional(),
                search: z.string().optional(),
                trashed: z.string().optional(),
                locale: z.string().optional().openapi({ example: 'en' }),
                sort: z.string().optional(),
                dir: z.enum(['asc', 'desc']).optional(),
            }),
        },
        responses: {
            200: { description: 'Entry list' },
        },
    });

    router.openapi(listEntriesRoute, async (c) => {
        const { type } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'read'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const query = c.req.query();
        const wantsFull = parseFullFromQuery(query);
        if (wantsFull && !permissions.allows(PERMISSION_ENTRY_READ_FULL))
            return forbidden(c);

        const params = {
            ...parseQueryParams(query),
            type: type,
            full: wantsFull,
        };
        return runQuery(c, params);
    });

    // ============================================================================
    // GET /entries/:type/:id
    // ============================================================================

    const getEntryRoute = createRoute({
        method: 'get',
        path: '/{type}/{id}',
        request: {
            params: z.object({
                type: z.string().openapi({ example: 'post' }),
                id: z.string().openapi({ example: 'clx1234abc' }),
            }),
            query: z.object({
                locale: z.string().optional(),
                previewToken: z.string().optional(),
                staged: z.string().optional(),
            }),
        },
        responses: {
            200: { description: 'Entry detail' },
            404: { description: 'Entry not found' },
        },
    });

    router.openapi(getEntryRoute, async (c) => {
        const { type, id } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'read'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const query = c.req.query();
        const wantsFull = parseFullFromQuery(query);
        if (wantsFull && !permissions.allows(PERMISSION_ENTRY_READ_FULL))
            return forbidden(c);

        const qp = parseQueryParams(query);
        const entry = await Astromech.entries.get({
            type: type,
            id,
            full: wantsFull,
            ...(qp.locale ? { locale: qp.locale } : {}),
            ...(qp.previewToken ? { previewToken: qp.previewToken } : {}),
            ...(qp.staged ? { staged: true } : {}),
        });
        if (!entry) return notFound(c, `Entry '${id}' not found`);
        return c.json({ data: entry });
    });

    // ============================================================================
    // POST /entries/:type
    // ============================================================================

    // The route body is validated per entry type in the handler (titled vs
    // titleless). The OpenAPI registration advertises the titled schema (the
    // documented default); the handler runs the type-specific schema and emits the
    // same `{ success: false, error }` envelope OpenAPIHono's validator would, so
    // titled types behave byte-for-byte as before while titleless types are admitted.
    const createEntryRoute = createRoute({
        method: 'post',
        path: '/{type}',
        request: {
            params: z.object({ type: z.string().openapi({ example: 'post' }) }),
            body: {
                content: {
                    'application/json': { schema: createEntrySchemaFor(false) },
                },
                required: true,
            },
        },
        responses: {
            201: { description: 'Entry created' },
            422: { description: 'Validation error' },
        },
    });

    router.openapi(createEntryRoute, async (c) => {
        const { type } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'create'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const raw = await c.req.json();
        const parsed = createEntrySchemaFor(getTypeTitleField(type)).safeParse(raw);
        if (!parsed.success) return zodValidationError(c, parsed.error);

        const caps = getTypeCapabilities(type);

        if (
            !caps?.statuses &&
            (parsed.data.status !== undefined || parsed.data.publishAt !== undefined)
        ) {
            return capabilityDenied(c, type, 'statuses');
        }

        if (!caps?.slug && parsed.data.slug !== undefined) {
            return capabilityDenied(c, type, 'slug');
        }

        const { title, slug, fields, status, publishAt, locale, localeGroup } =
            parsed.data;

        const entry = await Astromech.entries.create({
            type: type,
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

    // ============================================================================
    // POST /entries/:type/query  (single-type)
    // ============================================================================

    router.post('/:type/query', async (c) => {
        const { type } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'read'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const body = await c.req.json<
            Omit<EntryQueryParams, 'type'> & Record<string, unknown>
        >();
        const wantsFull = parseFullFromBody(body);
        if (wantsFull && !permissions.allows(PERMISSION_ENTRY_READ_FULL))
            return forbidden(c);

        const validatedSort = validateSort(body.sort);
        const params: EntryQueryParams & { type: string } = {
            ...body,
            type: type,
            full: wantsFull,
            ...(validatedSort !== undefined ? { sort: validatedSort } : {}),
        };
        return runQuery(c, params);
    });

    // ============================================================================
    // POST /entries/:type/bulk-update
    // ============================================================================

    router.post('/:type/bulk-update', async (c) => {
        const { type } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'update'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const raw = await c.req.json();
        const parsed = bulkUpdateSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { ids, data } = parsed.data;
        const caps = getTypeCapabilities(type);

        if (
            !caps?.statuses &&
            (data.status !== undefined || data.publishAt !== undefined)
        ) {
            return capabilityDenied(c, type, 'statuses');
        }

        if (!caps?.slug && data.slug !== undefined) {
            return capabilityDenied(c, type, 'slug');
        }

        if (data.status === 'published') {
            if (!permissions.allowsMethod(entryGate(type, 'publish')))
                return forbidden(c);
        }

        const entries = await Astromech.entries.update({
            type: type,
            id: ids,
            data: data as EntryUpdateData,
        });
        return c.json({ data: entries });
    });

    // ============================================================================
    // POST /entries/:type/bulk-trash
    // ============================================================================

    router.post('/:type/bulk-trash', async (c) => {
        const { type } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'delete'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.trash) return capabilityDenied(c, type, 'trash');

        const raw = await c.req.json();
        const parsed = bulkTrashOrDeleteSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        await Astromech.entries.trash({
            type: type,
            id: parsed.data.ids,
            ...(parsed.data.cascadeLocales ? { cascadeLocales: true } : {}),
        });
        return c.json({ success: true });
    });

    // ============================================================================
    // POST /entries/:type/bulk-delete
    // ============================================================================

    router.post('/:type/bulk-delete', async (c) => {
        const { type } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'delete'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const raw = await c.req.json();
        const parsed = bulkTrashOrDeleteSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        await Astromech.entries.delete({
            type: type,
            id: parsed.data.ids,
            ...(parsed.data.cascadeLocales ? { cascadeLocales: true } : {}),
        });
        return c.json({ success: true });
    });

    // ============================================================================
    // POST /entries/:type/bulk-restore
    // ============================================================================

    router.post('/:type/bulk-restore', async (c) => {
        const { type } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'update'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.trash) return capabilityDenied(c, type, 'trash');

        const raw = await c.req.json();
        const parsed = bulkIdsSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const entries = await Astromech.entries.restore({
            type: type,
            id: parsed.data.ids,
        });
        return c.json({ data: entries });
    });

    // ============================================================================
    // POST /entries/:type/bulk-publish
    // ============================================================================

    router.post('/:type/bulk-publish', async (c) => {
        const { type } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'publish'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.statuses) return capabilityDenied(c, type, 'statuses');

        const raw = await c.req.json();
        const parsed = bulkIdsSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const entries = await Astromech.entries.publish({
            type: type,
            id: parsed.data.ids,
        });
        return c.json({ data: entries });
    });

    // ============================================================================
    // POST /entries/:type/bulk-unpublish
    // ============================================================================

    router.post('/:type/bulk-unpublish', async (c) => {
        const { type } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'publish'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.statuses) return capabilityDenied(c, type, 'statuses');

        const raw = await c.req.json();
        const parsed = bulkIdsSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const entries = await Astromech.entries.unpublish({
            type: type,
            id: parsed.data.ids,
        });
        return c.json({ data: entries });
    });

    // ============================================================================
    // POST /entries/:type/bulk-schedule
    // ============================================================================

    router.post('/:type/bulk-schedule', async (c) => {
        const { type } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'publish'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.statuses) return capabilityDenied(c, type, 'statuses');

        const raw = await c.req.json();
        const parsed = bulkScheduleSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const entries = await Astromech.entries.schedule({
            type: type,
            id: parsed.data.ids,
            publishAt: parsed.data.publishAt,
        });
        return c.json({ data: entries });
    });

    // ============================================================================
    // POST /entries/:type/:id/restore
    // ============================================================================

    router.post('/:type/:id/restore', async (c) => {
        const { type, id } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'update'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.trash) return capabilityDenied(c, type, 'trash');

        const entry = await Astromech.entries.restore({
            type: type,
            id,
        });
        return c.json({ data: entry });
    });

    // ============================================================================
    // POST /entries/:type/:id/duplicate
    // ============================================================================

    router.post('/:type/:id/duplicate', async (c) => {
        const { type, id } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'create'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        let overrides: Record<string, unknown> = {};
        try {
            const raw = await c.req.json();
            const parsed = duplicateOverridesSchema.safeParse(raw);
            if (!parsed.success) return fromZodError(c, parsed.error);
            overrides = parsed.data as Record<string, unknown>;
        } catch {
            // No body / empty body — proceed with no overrides.
        }
        const entry = await Astromech.entries.duplicate({
            type: type,
            id,
            overrides: overrides as EntryDuplicateOverrides,
        });
        return c.json({ data: entry }, 201);
    });

    // ============================================================================
    // PUT /entries/:type/:id
    // ============================================================================

    const updateEntryRoute = createRoute({
        method: 'put',
        path: '/{type}/{id}',
        request: {
            params: z.object({
                type: z.string().openapi({ example: 'post' }),
                id: z.string().openapi({ example: 'clx1234abc' }),
            }),
            body: {
                content: {
                    'application/json': { schema: updateEntrySchemaFor(false) },
                },
                required: true,
            },
        },
        responses: {
            200: { description: 'Entry updated' },
            422: { description: 'Validation error' },
        },
    });

    router.openapi(updateEntryRoute, async (c) => {
        const { type, id } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'update'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const raw = await c.req.json();
        const parsed = updateEntrySchemaFor(getTypeTitleField(type)).safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const caps = getTypeCapabilities(type);

        if (
            !caps?.statuses &&
            (parsed.data.status !== undefined || parsed.data.publishAt !== undefined)
        ) {
            return capabilityDenied(c, type, 'statuses');
        }

        if (!caps?.slug && parsed.data.slug !== undefined) {
            return capabilityDenied(c, type, 'slug');
        }

        const { title, slug, fields, status, publishAt } = parsed.data;

        if (parsed.data.status === 'published') {
            if (!permissions.allowsMethod(entryGate(type, 'publish')))
                return forbidden(c);
        }

        const entry = await Astromech.entries.update({
            type: type,
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

    // ============================================================================
    // DELETE /entries/:type/trash  (empty trash)
    // ============================================================================

    router.delete('/:type/trash', async (c) => {
        const { type } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'delete'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.trash) return capabilityDenied(c, type, 'trash');

        await Astromech.entries.emptyTrash({ type: type });
        return c.json({ success: true });
    });

    // ============================================================================
    // DELETE /entries/:type/:id/force  (force delete)
    // ============================================================================

    router.delete('/:type/:id/force', async (c) => {
        const { type, id } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'delete'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        await Astromech.entries.delete({
            type: type,
            id,
            cascadeLocales: cascadeLocalesFromQuery(c.req.query()),
        });
        return c.json({ success: true });
    });

    // ============================================================================
    // DELETE /entries/:type/:id  (soft delete)
    // ============================================================================

    const trashEntryRoute = createRoute({
        method: 'delete',
        path: '/{type}/{id}',
        request: {
            params: z.object({
                type: z.string().openapi({ example: 'post' }),
                id: z.string().openapi({ example: 'clx1234abc' }),
            }),
        },
        responses: {
            200: { description: 'Entry trashed' },
            404: { description: 'Entry not found' },
        },
    });

    router.openapi(trashEntryRoute, async (c) => {
        const { type, id } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'delete'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const cascade = cascadeLocalesFromQuery(c.req.query());
        const caps = getTypeCapabilities(type);

        if (!caps?.trash) {
            // trash is off → hard delete
            await Astromech.entries.delete({
                type: type,
                id,
                cascadeLocales: cascade,
            });
        } else {
            await Astromech.entries.trash({
                type: type,
                id,
                cascadeLocales: cascade,
            });
        }
        return c.json({ success: true });
    });

    // ============================================================================
    // POST /entries/:type/:id/publish
    // ============================================================================

    router.post('/:type/:id/publish', async (c) => {
        const { type, id } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'publish'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.statuses) return capabilityDenied(c, type, 'statuses');

        const entry = await Astromech.entries.publish({
            type: type,
            id,
        });
        return c.json({ data: entry });
    });

    // ============================================================================
    // POST /entries/:type/:id/unpublish
    // ============================================================================

    router.post('/:type/:id/unpublish', async (c) => {
        const { type, id } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'publish'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.statuses) return capabilityDenied(c, type, 'statuses');

        const entry = await Astromech.entries.unpublish({
            type: type,
            id,
        });
        return c.json({ data: entry });
    });

    // ============================================================================
    // POST /entries/:type/:id/schedule
    // ============================================================================

    router.post('/:type/:id/schedule', async (c) => {
        const { type, id } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'publish'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.statuses) return capabilityDenied(c, type, 'statuses');

        const raw = await c.req.json();
        const parsed = scheduleEntrySchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);
        const entry = await Astromech.entries.schedule({
            type: type,
            id,
            publishAt: parsed.data.publishAt,
        });
        return c.json({ data: entry });
    });

    // ============================================================================
    // GET /entries/:type/:id/versions
    // ============================================================================

    router.get('/:type/:id/versions', async (c) => {
        const { type, id } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'read'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const versions = await Astromech.entries.versions({
            type: type,
            id,
        });
        return c.json({ data: versions });
    });

    // ============================================================================
    // POST /entries/:type/:id/versions/:versionId/restore
    // ============================================================================

    router.post('/:type/:id/versions/:versionId/restore', async (c) => {
        const { type, id, versionId } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'update'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const entry = await Astromech.entries.restoreVersion({
            type: type,
            id,
            versionId,
        });
        return c.json({ data: entry });
    });

    // ============================================================================
    // GET /entries/:type/:id/incoming-relationships
    // ============================================================================

    router.get('/:type/:id/incoming-relationships', async (c) => {
        const { type, id } = c.req.param();
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, 'read'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const relations = await Astromech.entries.incomingRelationships({
            type: type,
            id,
        });
        return c.json({ data: relations });
    });

    // ========================================================================
    // Forward versioning (staged entries)
    //
    // Permissions: createStaged / deleteStaged / token issue+revoke = `update`;
    // getStaged = `read`; mergeStaged = `publish`. All require the `staging`
    // capability (built-in storage); the route checks it up-front so a misconfig
    // returns 409 rather than the service's 500.
    // ========================================================================

    const previewTokenSchema = z.object({
        expiresAt: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
    });

    /** Guard a staging route: type exists + permission + `staging` capability. */
    function requireStaging(
        c: Parameters<typeof forbidden>[0],
        type: string,
        action: EntryAction
    ): Response | null {
        const permissions = permissionsFor(c.var.role);
        if (!permissions.allowsMethod(entryGate(type, action))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);
        const caps = getTypeCapabilities(type);
        if (!caps?.staging) return capabilityDenied(c, type, 'staging');
        return null;
    }

    // ── POST /:type/:id/staged  (create) ────────────────────────────────────
    router.post('/:type/:id/staged', async (c) => {
        const { type, id } = c.req.param();
        const denied = requireStaging(c, type, 'update');
        if (denied) return denied;

        try {
            const entry = await Astromech.entries.createStaged({
                type: type,
                id,
            });
            return c.json({ data: entry }, 201);
        } catch (err) {
            if (err instanceof StagedEntryExistsError) {
                // 409 carries the existing staged id so the admin can redirect.
                return c.json(
                    {
                        error: {
                            code: 'staged_entry_exists',
                            message: err.message,
                            status: 409,
                            details: { stagedId: err.stagedId },
                        },
                    },
                    409
                );
            }
            return internalError(c, err instanceof Error ? err.message : undefined);
        }
    });

    // ── GET /:type/:id/staged  (read) ───────────────────────────────────────
    router.get('/:type/:id/staged', async (c) => {
        const { type, id } = c.req.param();
        const denied = requireStaging(c, type, 'read');
        if (denied) return denied;

        const entry = await Astromech.entries.getStaged({
            type: type,
            id,
        });
        return c.json({ data: entry });
    });

    // ── POST /:type/:id/staged/merge  (publish) ─────────────────────────────
    router.post('/:type/:id/staged/merge', async (c) => {
        const { type, id } = c.req.param();
        const denied = requireStaging(c, type, 'publish');
        if (denied) return denied;

        const entry = await Astromech.entries.mergeStaged({
            type: type,
            id,
        });
        return c.json({ data: entry });
    });

    // ── DELETE /:type/:id/staged  (discard) ─────────────────────────────────
    router.delete('/:type/:id/staged', async (c) => {
        const { type, id } = c.req.param();
        const denied = requireStaging(c, type, 'update');
        if (denied) return denied;

        await Astromech.entries.deleteStaged({
            type: type,
            id,
        });
        return c.json({ success: true });
    });

    // ── POST /:type/:id/preview-token  (issue) ──────────────────────────────
    router.post('/:type/:id/preview-token', async (c) => {
        const { type, id } = c.req.param();
        const denied = requireStaging(c, type, 'update');
        if (denied) return denied;

        let expiresAt: Date | null = null;
        try {
            const raw = await c.req.json();
            const parsed = previewTokenSchema.safeParse(raw);
            if (!parsed.success) return fromZodError(c, parsed.error);
            if (parsed.data.expiresAt) expiresAt = new Date(parsed.data.expiresAt);
        } catch {
            // No body / empty body — no TTL.
        }
        const result = await Astromech.entries.issuePreviewToken({
            type: type,
            id,
            expiresAt,
        });
        return c.json({ data: result }, 201);
    });

    // ── DELETE /:type/:id/preview-token  (revoke) ───────────────────────────
    router.delete('/:type/:id/preview-token', async (c) => {
        const { type, id } = c.req.param();
        const denied = requireStaging(c, type, 'update');
        if (denied) return denied;

        await Astromech.entries.revokePreviewToken({
            type: type,
            id,
        });
        return c.json({ success: true });
    });

    return router;
}

/** The entries router, mounted at `/entries`. Serves every entry type. */
export const entriesRouter = createEntriesRouter();
