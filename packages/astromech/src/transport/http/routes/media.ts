/**
 * Media Routes
 *
 * File upload, listing, replace, update, and delete.
 */
import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { JsonObject } from '@/types/index';
import { OpenAPIHono } from '@hono/zod-openapi';
import { mediaDefinition } from '@/media/service';
import { permissionsFor } from '@/permissions/permissions-for';
import { jsonObject } from '@/services/json';
import { badRequest, forbidden, notFound } from '@/transport/http/middleware/errors';
import { MEDIA_ROUTE_SPECS } from './http-routes';
import { mountRestRoutes } from './rest-route';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

mountRestRoutes(router, {
    catalogue: mediaDefinition.catalogue,
    specs: MEDIA_ROUTE_SPECS,
});

// POST /media — bespoke
// Not in the table: `binaryInput`. The body is multipart and a `File` has no
// JSON representation, so no contract schema can validate the call. Optional
// `fields` travel as a JSON-encoded form part.
router.post('/', async (c) => {
    const permissions = permissionsFor(c.var.ctx.role);
    if (!permissions.allowsMethod(mediaDefinition.catalogue.upload)) return forbidden(c);

    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
        return badRequest(c, 'A file field is required');
    }
    const fields = readFieldsPart(formData.get('fields'));
    if (fields === null) {
        return badRequest(c, 'The fields part must be a JSON object');
    }

    const media = await c.var.ctx.media.upload({
        file,
        ...(fields !== undefined ? { fields } : {}),
    });
    return c.json({ data: media }, 201);
});

// POST /media/:id/replace — bespoke
// Not in the table: `binaryInput`, plus the same `media.get` pre-flight.
router.post('/:id/replace', async (c) => {
    const { id } = c.req.param();
    const permissions = permissionsFor(c.var.ctx.role);
    if (!permissions.allowsMethod(mediaDefinition.catalogue.replace)) return forbidden(c);

    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
        return badRequest(c, 'A file field is required');
    }

    // The service throws for an unknown id, which would surface as a 500.
    const item = await c.var.ctx.media.get({ id });
    if (!item) return notFound(c, `Media '${id}' not found`);

    const media = await c.var.ctx.media.replace({ id, file });
    return c.json({ data: media });
});

export { router as mediaRouter };

/**
 * The `fields` form part: `undefined` when absent, `null` when it is not a JSON
 * object, else the object.
 */
function readFieldsPart(part: FormDataEntryValue | null): JsonObject | null | undefined {
    if (part === null) return undefined;
    if (typeof part !== 'string') return null;
    let value: unknown;
    try {
        value = JSON.parse(part);
    } catch {
        return null;
    }
    const parsed = jsonObject.safeParse(value);
    return parsed.success ? parsed.data : null;
}
