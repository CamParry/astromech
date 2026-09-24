import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { subjectId } from '../internal/subject';
import { getNotificationRepository } from '../repository';

/**
 * Dismiss one row. The delete filters on the subject as well as the id, so an
 * id belonging to somebody else is a no-op rather than a cross-user write —
 * that pairing is the whole of the authorization here.
 */
export const dismissNotification = defineServiceMethod({
    summary: 'Dismiss one of your own notifications.',
    input: z.object({ id: z.string() }),
    access: 'public',
    sessionScoped: true,
    mutates: true,
    destructive: true,
    idempotent: true,
    async handler(params, ctx): Promise<void> {
        await getNotificationRepository().delete({
            id: params.id,
            userId: subjectId(ctx.user),
        });
    },
});
