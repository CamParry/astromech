/**
 * Users service method descriptors — declared permission + effect per users verb.
 *
 * These declare the PRIMARY method permission. Secondary authorization that isn't
 * a single method permission (self-access on read/update, the last-admin guard)
 * stays explicit in the route, per the services-architecture decision that such
 * rules are identity/policy concerns, not the method's declared permission.
 */

import type { ServiceMethodDescriptor } from '@/types/index.js';
import { createUserSchema, updateUserSchema } from './schema.js';

export const usersDescriptors = {
    query: {
        name: 'users.query',
        summary: 'List CMS users.',
        permission: 'users:read',
        mutates: false,
    },
    get: {
        name: 'users.get',
        summary: 'Read one user by id.',
        permission: 'users:read',
        mutates: false,
    },
    create: {
        name: 'users.create',
        summary: 'Create a new CMS user.',
        input: createUserSchema,
        permission: 'users:create',
        mutates: true,
    },
    update: {
        name: 'users.update',
        summary: 'Update a user’s profile or role.',
        input: updateUserSchema,
        permission: 'users:update',
        mutates: true,
        idempotent: true,
    },
    delete: {
        name: 'users.delete',
        summary: 'Delete a CMS user.',
        permission: 'users:delete',
        mutates: true,
        destructive: true,
    },
} satisfies Record<string, ServiceMethodDescriptor>;
