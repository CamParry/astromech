/**
 * Astromech API — Hono Root App
 *
 * Mounted inside the Astro catch-all endpoint at `${apiRoute}/[...path]`.
 * Auth and Better Auth routes are excluded via Astro's route ordering.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { requireAuth } from './middleware/auth.js';
import type { AuthVariables } from './middleware/auth.js';
import { onError, onNotFound } from './middleware/errors.js';
import { entriesRouter } from './routes/entries.js';
import { usersRouter } from './routes/users.js';
import { mediaRouter } from './routes/media.js';
import { settingsRouter } from './routes/settings.js';
import { entryTypesRouter } from './routes/entry-types.js';
import { cronRouter } from './routes/cron.js';
import { Astromech } from '@/sdk/local/index.js';

type AppEnv = { Variables: AuthVariables };

export const app = new OpenAPIHono<AppEnv>();

// ============================================================================
// Error handling
// ============================================================================

app.onError(onError);
app.notFound(onNotFound);

// ============================================================================
// Public routes (no auth required)
// ============================================================================

app.get('/setup/check', async (c) => {
    const users = await Astromech.users.all();
    return c.json({ needsSetup: users.length === 0 });
});

// ============================================================================
// All routes require authentication
// ============================================================================

app.use('*', requireAuth);

// GET /me — current user + role (used by admin SPA)
app.get('/me', (c) => {
    return c.json({ data: { user: c.var.user, role: c.var.role } });
});

// ============================================================================
// Route mounting
// ============================================================================

app.route('/entries', entriesRouter);
app.route('/users', usersRouter);
app.route('/media', mediaRouter);
app.route('/settings', settingsRouter);
app.route('/entry-types', entryTypesRouter);
app.route('/cron', cronRouter);

// ============================================================================
// OpenAPI spec + Swagger UI
// ============================================================================

app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
        title: 'Astromech CMS API',
        version: '1.0.0',
        description: 'Astromech CMS REST API',
    },
});

if (process.env.NODE_ENV !== 'production') {
    app.get('/docs', swaggerUI({ url: '/api/cms/openapi.json' }));
}
