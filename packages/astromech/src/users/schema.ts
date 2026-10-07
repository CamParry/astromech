import { z } from '@hono/zod-openapi';
import { listKeys } from '@/content/list';
import { versionSchema } from '@/content/schema';
import { DEFAULT_ROLE_SLUG, roleSlugSchema } from '@/permissions/roles';
import { withFallback } from '@/services/fallback';
import { jsonObject, unparsedJsonObject } from '@/services/json';

/** What `users.query` takes: the public `UserQueryParams`. */
export const queryUsersSchema = z.strictObject({
    /** The locale each user's content is read in. Default: the default locale. */
    locale: z.string().optional(),
    search: z.string().optional(),
    ...listKeys,
});

export const createUserSchema = z
    .strictObject({
        email: z.string().email('Must be a valid email address'),
        name: z.string().min(1, 'Name is required'),
        fields: jsonObject.optional(),
        // Defaulted here, not by the column: a create that names no role gets
        // the least-privileged built-in rather than whatever the DDL says.
        role: roleSlugSchema.default(DEFAULT_ROLE_SLUG),
        // Without one the user sets a password through the reset link. Eight
        // characters is better-auth's own floor.
        password: z.string().min(8, 'Password must be at least 8 characters').optional(),
    })
    .openapi('CreateUser');

export const updateUserSchema = z
    .strictObject({
        email: z.string().email('Must be a valid email address').optional(),
        name: z.string().min(1, 'Name cannot be empty').optional(),
        fields: jsonObject.optional(),
        role: roleSlugSchema.optional(),
    })
    .openapi('UpdateUser');

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

/**
 * The keys a user version keeps: the site's own fields in one locale. The
 * account (`name`, `email`, `role`) is never versioned.
 */
export const userSnapshotSchema = userSchema
    .pick({ fields: true })
    .openapi('UserSnapshot');

/** One saved version of one locale of a user's fields, as `getVersion` answers it. */
export const userVersionSchema = versionSchema('UserVersion', userSnapshotSchema);
