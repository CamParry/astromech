/**
 * Users service method contracts — declared permission + effect per users verb.
 *
 * These declare the PRIMARY method permission. Secondary authorization that isn't
 * a single method permission (self-access on read/update, the last-admin guard)
 * stays explicit in the route, per the services-architecture decision that such
 * rules are identity/policy concerns, not the method's declared permission.
 *
 * `input` is the METHOD's argument object, not the HTTP body: `users.update` is
 * called `update({ id, data })`, so the contract composes the body schema into
 * that shape rather than declaring the body alone. The routes still parse the
 * body schemas directly — nothing here changes what the wire accepts.
 */

import type { ServiceMethodContract } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { createUserSchema, updateUserSchema, userQuerySchema } from './schema';

export const usersContract = {
    query: {
        summary: 'List CMS users.',
        input: userQuerySchema,
        permission: 'users:read',
        mutates: false,
    },
    get: {
        summary: 'Read one user by id.',
        input: z.object({ id: z.string() }),
        permission: 'users:read',
        mutates: false,
    },
    create: {
        summary: 'Create a new CMS user.',
        input: createUserSchema,
        permission: 'users:create',
        mutates: true,
    },
    update: {
        summary:
            'Update a user’s profile or role. Fields merge: omitted fields keep ' +
            'their current value, and arrays are replaced whole.',
        input: z.object({ id: z.string(), data: updateUserSchema }),
        permission: 'users:update',
        mutates: true,
        idempotent: true,
    },
    delete: {
        summary: 'Delete a CMS user.',
        input: z.object({ id: z.string() }),
        permission: 'users:delete',
        mutates: true,
        destructive: true,
    },
} satisfies Record<string, ServiceMethodContract>;
