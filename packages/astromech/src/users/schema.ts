import { z } from '@hono/zod-openapi';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';

export const createUserSchema = z
    .object({
        email: z.string().email('Must be a valid email address'),
        name: z.string().min(1, 'Name is required'),
        fields: z.record(z.string(), z.unknown()).optional(),
        // Defaulted here, not by the column: a create that names no role gets
        // the least-privileged built-in rather than whatever the DDL says.
        roleSlug: z.string().default(DEFAULT_ROLE_SLUG),
    })
    .openapi('CreateUser');

export const updateUserSchema = z
    .object({
        email: z.string().email('Must be a valid email address').optional(),
        name: z.string().min(1, 'Name cannot be empty').optional(),
        fields: z.record(z.string(), z.unknown()).optional(),
        roleSlug: z.string().optional(),
    })
    .openapi('UpdateUser');

const sortDirection = z.enum(['asc', 'desc']);

/**
 * Call schema for `users.query` — mirrors `UserQueryParams`. Not a request body:
 * the HTTP route reads these off the query string, so this exists purely so the
 * method manifest can describe how the method is called.
 */
export const userQuerySchema = z.object({
    search: z.string().optional(),
    page: z.number().optional(),
    limit: z.union([z.number(), z.literal('all')]).optional(),
    sort: z
        .union([
            z.record(z.string(), sortDirection),
            z.array(z.record(z.string(), sortDirection)),
        ])
        .optional(),
});
