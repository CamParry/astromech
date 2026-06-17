/**
 * Settings Routes
 *
 * Key-value settings read and write.
 *
 * Routes:
 *   GET  /settings         → all()
 *   GET  /settings/:key    → get()
 *   PUT  /settings/:key    → set()
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { Astromech } from '@/transport/local/index.js';
import {
    forbidden,
    fromZodError,
    internalError,
    notFound,
} from '@/transport/http/middleware/errors.js';
import type { AuthVariables } from '@/transport/http/middleware/auth.js';
import type { JsonValue } from '@/types/index.js';
import { withPermissions } from '@/policies/permissions/with-permissions.js';
import { setSettingSchema, settingsDescriptors } from '@/settings/index.js';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

// ============================================================================
// GET /settings
// ============================================================================

router.get('/', async (c) => {
    const permissions = withPermissions(c.var.role);
    if (!permissions.allowsMethod(settingsDescriptors.all)) return forbidden(c);

    try {
        // Authenticated admin endpoint (guarded by settings:read): return the
        // full set, not just public keys.
        const settings = await Astromech.settings.all({ full: true });
        return c.json({ data: settings });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /settings/:key
// ============================================================================

router.get('/:key', async (c) => {
    const { key } = c.req.param();
    const permissions = withPermissions(c.var.role);
    if (!permissions.allowsMethod(settingsDescriptors.get)) return forbidden(c);

    try {
        // Authenticated admin endpoint (guarded by settings:read): return the
        // full shape so private settings (e.g. plugin pages) are editable. The
        // the Client requests base + per-locale keys separately, so no locale
        // merge is needed here.
        const value = await Astromech.settings.get(key, { full: true });
        if (value === null) return notFound(c, `Setting '${key}' not found`);
        return c.json({ data: { key, value } });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// PUT /settings/:key
// ============================================================================

router.put('/:key', async (c) => {
    const { key } = c.req.param();
    const permissions = withPermissions(c.var.role);
    if (!permissions.allowsMethod(settingsDescriptors.set)) return forbidden(c);

    try {
        const raw = await c.req.json();
        const parsed = setSettingSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const setting = await Astromech.settings.set(key, parsed.data.value as JsonValue);
        return c.json({ data: setting });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as settingsRouter };
