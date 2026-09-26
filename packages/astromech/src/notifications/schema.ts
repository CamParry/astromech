/** The notifications service's output schema. */

import { z } from '@hono/zod-openapi';
import { fallback } from '@/services/fallback';

/** One notification in the caller's inbox: the public `Notification`. */
export const notificationSchema = z
    .object({
        id: z.string(),
        userId: z.string(),
        type: z.string(),
        title: z.string(),
        message: z.string(),
        /** Admin-relative click-through path, without the admin base prefix. */
        href: z.string().nullable().catch(fallback(null)),
        /** An ISO timestamp. */
        createdAt: z.string(),
    })
    .openapi('Notification');
