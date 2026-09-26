import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { subjectId } from '../internal/subject';
import { notificationRepository } from '../repository';

/** Clear the caller's whole inbox, and nobody else's. */
export const dismissAllNotifications = defineServiceMethod({
    summary: 'Dismiss every one of your own notifications.',
    input: z.object({}),
    output: z.void(),
    access: 'public',
    sessionScoped: true,
    mutates: true,
    destructive: true,
    idempotent: true,
    async handler(_params, ctx): Promise<void> {
        await notificationRepository.deleteByUser(subjectId(ctx.user));
    },
});
