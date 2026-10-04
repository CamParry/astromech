/**
 * Entry Types Metadata Routes
 *
 * Entry type configuration for the SPA to discover available types, fields
 * and display settings. Neither handler is in a REST route table — only the
 * resolved config, projected into a metadata shape, gated on `entry:{type}:read`.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { ResolvedEntryType } from '@/types/index';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { getConfig } from '@/config/registry';
import { resolveEntryType } from '@/entries/entry-types';
import { entryPermission } from '@/permissions/entry-permission';
import { permissionsFor } from '@/permissions/permissions-for';
import { forbidden, notFound } from '@/transport/http/middleware/errors';
import { errorResponses } from './error-responses';

type Env = { Variables: AuthVariables };

/** One open object: a field or an admin column, documented without its keys. */
const openObject = z.record(z.string(), z.unknown());

/** What both routes answer for one entry type, as the document names it. */
const entryTypeMetaSchema = z
    .object({
        type: z.string(),
        single: z.string(),
        plural: z.string(),
        versioning: z.union([
            z.boolean(),
            z.object({ maxVersions: z.number().optional() }),
        ]),
        slug: z.union([
            z.object({ source: z.string().optional(), prefix: z.string().optional() }),
            z.literal(false),
            z.null(),
        ]),
        adminColumns: z.array(openObject),
        fields: z.object({ main: z.array(openObject), sidebar: z.array(openObject) }),
        capabilities: z.object({
            statuses: z.boolean(),
            slug: z.boolean(),
            translatable: z.boolean(),
            versioning: z.boolean(),
            staging: z.boolean(),
            trash: z.boolean(),
        }),
        titleField: z.union([z.literal('title'), z.literal(false)]),
    })
    .openapi('EntryTypeMeta');

const router = new OpenAPIHono<Env>();

// GET /entry-types — bespoke
// No method id, and the response is a bare array rather than an envelope.
router.get('/', (c) => {
    const { entryTypes } = getConfig();
    const permissions = permissionsFor(c.var.ctx.role);

    const meta = Object.entries(entryTypes)
        .filter(([type]) => permissions.allows(entryPermission(type, 'read')))
        .map(([type, config]) => entryTypeMeta(type, config));

    return c.json(meta);
});
router.openAPIRegistry.registerPath({
    method: 'get',
    path: '/',
    // No method answers these routes, so their ids follow the path.
    operationId: 'entryTypes.list',
    summary: 'List the entry types the caller may read.',
    responses: {
        200: {
            description: 'The entry types the caller may read.',
            content: { 'application/json': { schema: z.array(entryTypeMetaSchema) } },
        },
        ...errorResponses({ session: true, permission: false, input: false }),
    },
});

// GET /entry-types/:type — bespoke
// No method id. It resolves root and plugin-qualified ids alike through
// `resolveEntryType`, so `widgets/widget` serves here exactly as on `/entries`.
router.get('/:type', (c) => {
    const { type } = c.req.param();

    // Permission before existence, as on every entries route: a 404 an
    // unpermitted caller can read is a type enumeration.
    if (!permissionsFor(c.var.ctx.role).allows(entryPermission(type, 'read'))) {
        return forbidden(c);
    }

    const config = resolveEntryType(getConfig(), type);
    if (!config) return notFound(c, `Entry type '${type}' not found`);

    return c.json(entryTypeMeta(type, config));
});
router.openAPIRegistry.registerPath({
    method: 'get',
    path: '/{type}',
    operationId: 'entryTypes.get',
    summary: 'Read one entry type.',
    request: { params: z.object({ type: z.string() }) },
    responses: {
        200: {
            description: 'The entry type.',
            content: { 'application/json': { schema: entryTypeMetaSchema } },
        },
        ...errorResponses({
            session: true,
            permission: true,
            notFound: 'No entry type matches the request.',
            input: false,
        }),
    },
});

/** The metadata both routes answer for the entry type `type`. */
function entryTypeMeta(
    type: string,
    config: ResolvedEntryType
): z.input<typeof entryTypeMetaSchema> {
    return {
        type,
        single: config.single,
        plural: config.plural,
        versioning: config.versioning ?? false,
        slug: config.slug ?? null,
        adminColumns: config.adminColumns ?? [],
        fields: config.fields,
        capabilities: config.capabilities,
        titleField: config.titleField,
    };
}

export { router as entryTypesRouter };
