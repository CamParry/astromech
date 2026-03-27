/**
 * Astromech API — Hono Root App
 *
 * Mounted inside the Astro catch-all endpoint at `${apiRoute}/[...path]`.
 * Auth and Better Auth routes are excluded via Astro's route ordering.
 */

import { Hono } from 'hono';
import { requireAuth } from './middleware/auth.js';
import type { AuthVariables } from './middleware/auth.js';
import { onError, onNotFound } from './middleware/errors.js';
import { entriesRouter } from './routes/entries.js';
import { usersRouter } from './routes/users.js';
import { mediaRouter } from './routes/media.js';
import { settingsRouter } from './routes/settings.js';
import { collectionsMetaRouter } from './routes/collections.js';
import { cronRouter } from './routes/cron.js';
import { Astromech } from '@/sdk/server/index.js';

type AppEnv = { Variables: AuthVariables };

export const app = new Hono<AppEnv>();

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

app.route('/collections', entriesRouter);
app.route('/users', usersRouter);
app.route('/media', mediaRouter);
app.route('/settings', settingsRouter);
app.route('/collections-meta', collectionsMetaRouter);
app.route('/cron', cronRouter);
