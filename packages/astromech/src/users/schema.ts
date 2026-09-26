import { z } from '@hono/zod-openapi';
import { sortSchema } from '@/content/list';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { withFallback } from '@/services/fallback';
import {
    jsonObject,
    nullableUnparsedJsonObject,
    unparsedJsonObject,
} from '@/services/json';

export const createUserSchema = z
    .object({
        email: z.string().email('Must be a valid email address'),
        name: z.string().min(1, 'Name is required'),
        fields: jsonObject.optional(),
        // Defaulted here, not by the column: a create that names no role gets
        // the least-privileged built-in rather than whatever the DDL says.
        role: z.string().default(DEFAULT_ROLE_SLUG),
        // Without one the user sets a password through the reset link. Eight
        // characters is better-auth's own floor.
        password: z.string().min(8, 'Password must be at least 8 characters').optional(),
    })
    .openapi('CreateUser');

export const updateUserSchema = z
    .object({
        email: z.string().email('Must be a valid email address').optional(),
        name: z.string().min(1, 'Name cannot be empty').optional(),
        fields: jsonObject.optional(),
        role: z.string().optional(),
    })
    .openapi('UpdateUser');

/**
 * Call schema for `users.query`, the shape of `UserQueryParams`. Not a request body:
 * the HTTP route reads these off the query string, so this exists purely so the
 * method manifest can describe how the method is called.
 */
export const userQuerySchema = z.object({
    locale: z.string().optional(),
    search: z.string().optional(),
    page: z.number().optional(),
    limit: z.union([z.number(), z.literal('all')]).optional(),
    sort: sortSchema,
});

/** An admin user account: the public `User`. */
export const userSchema = z
    .object({
        id: z.string(),
        email: z.string(),
        name: z.string(),
        emailVerified: z.boolean(),
        image: withFallback(z.string().nullable(), null),
        /** The locale the content came from. */
        locale: z.string(),
        /** Locales that have a content row, this one included. Sorted. */
        locales: z.array(z.string()),
        fields: unparsedJsonObject,
        /** The slug of the user's role, resolved against the config. */
        role: z.string(),
        createdAt: z.date(),
        /** The user's last change: name, email or role, or content in any locale. */
        updatedAt: z.date(),
    })
    .openapi('User');

/** A saved snapshot of one locale of one user's fields. */
export const userVersionSchema = z
    .object({
        id: z.string(),
        userId: z.string(),
        locale: z.string(),
        /** Position in the sequence, which runs per user and locale from 1. */
        version: z.number(),
        fields: nullableUnparsedJsonObject,
        createdAt: z.date(),
        createdBy: withFallback(z.string().nullable(), null),
    })
    .openapi('UserVersion');
