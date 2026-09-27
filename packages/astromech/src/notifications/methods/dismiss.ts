import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { subjectId } from '../internal/subject';
import { notificationRepository } from '../repository';

/**
 * The delete matches the signed-in user as well as the id, so another user's
 * notification is left alone and the call is a no-op.
 */
export const dismissNotification = defineServiceMethod({
    summary: 'Dismiss one of your own notifications.',
    input: z.strictObject({ id: z.string() }),
    output: z.void(),
    access: 'public',
    sessionScoped: true,
    mutates: true,
    destructive: true,
    idempotent: true,
    async handler(params, ctx): Promise<void> {
        const { id } = params;
        const { user } = ctx;
        const userId = subjectId(user);

        await notificationRepository.delete({ id, userId });
    },
});
