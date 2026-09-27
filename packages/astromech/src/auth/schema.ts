import { z } from '@hono/zod-openapi';
import { roleSchema } from '@/permissions/schema';
import { userSchema } from '@/users/schema';

/** The signed-in user and their role: what `GET /api/me` answers under `data`. */
export const meSchema = z
    .object({
        user: userSchema,
        role: roleSchema,
    })
    .openapi('Me');
