import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { subjectId } from '../internal/subject';
import { notificationRepository } from '../repository';

/** Deletes only the signed-in user's rows, and throws with nobody signed in. */
export const dismissAllNotifications = defineServiceMethod({
    summary: 'Dismiss every one of your own notifications.',
    input: z.strictObject({}),
    output: z.void(),
    access: 'public',
    sessionScoped: true,
    mutates: true,
    destructive: true,
    idempotent: true,
    async handler(_params, ctx): Promise<void> {
        const { user } = ctx;
        const userId = subjectId(user);

        await notificationRepository.deleteByUser(userId);
    },
});
