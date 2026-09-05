import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { subjectId } from '../internal/subject';
import { createNotificationRepository } from '../repository';

/** Clear the caller's whole inbox, and nobody else's. */
export const dismissAllNotifications = defineServiceMethod({
    summary: 'Dismiss every one of your own notifications.',
    input: z.object({}),
    access: 'public',
    sessionScoped: true,
    mutates: true,
    destructive: true,
    idempotent: true,
    async handler(_params: unknown, ctx): Promise<void> {
        await createNotificationRepository().dismissAll(subjectId(ctx.user));
    },
});
