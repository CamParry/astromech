/**
 * Users service method contracts — declared permission + effect per users
 * verb. `input` is the METHOD's argument object, not the HTTP body: `create`
 * takes `{ data }` and `update` takes `{ id, data }`, so the contract composes
 * the body schema into that shape.
 */

import type { ServiceMethodContract } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { createUserSchema, updateUserSchema, userQuerySchema } from './schema';

/** A content-level method addresses one locale of the user. */
const locale = z.string().optional();

export const usersContract = {
    query: {
        summary: 'List CMS users.',
        input: userQuerySchema,
        permission: 'users:read',
        mutates: false,
    },
    get: {
        summary: 'Read one user by id.',
        input: z.object({ id: z.string(), locale }),
        permission: 'users:read',
        mutates: false,
    },
    create: {
        summary: 'Create a new CMS user.',
        input: z.object({ data: createUserSchema }),
        permission: 'users:create',
        mutates: true,
    },
    update: {
        summary:
            'Update a user’s profile or role. Fields merge: omitted fields keep ' +
            'their current value, and arrays are replaced whole.',
        input: z.object({ id: z.string(), locale, data: updateUserSchema }),
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
    versions: {
        summary: 'List the saved versions of one locale of a user’s fields.',
        input: z.object({ id: z.string(), locale }),
        permission: 'users:read',
        mutates: false,
    },
    restoreVersion: {
        summary: 'Restore one locale of a user’s fields to a saved version.',
        input: z.object({ id: z.string(), locale, versionId: z.string() }),
        permission: 'users:update',
        mutates: true,
    },
} satisfies Record<string, ServiceMethodContract>;
