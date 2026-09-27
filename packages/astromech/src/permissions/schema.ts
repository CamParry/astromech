import type { Role } from '@/types/domain';
import { z } from '@hono/zod-openapi';

/** A role as it leaves core: `GET /api/me` answers the caller's with this. */
export const roleSchema = z
    .object({
        slug: z.string(),
        name: z.string(),
        /** The permissions the role grants, wildcards (`entry:*`, `*`) included. */
        permissions: z.array(z.string()),
        /** Whether core defines the role (`admin`, `editor`) rather than the config. */
        isBuiltIn: z.boolean(),
    })
    .openapi('Role') satisfies z.ZodType<Role>;
