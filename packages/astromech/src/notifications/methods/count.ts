import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { subjectId } from '../internal/subject';
import { notificationRepository } from '../repository';

/** Counts only the signed-in user's rows, and throws with nobody signed in. */
export const countNotifications = defineServiceMethod({
    summary: 'Count your own undismissed notifications.',
    input: z.strictObject({}),
    output: z.number(),
    access: 'public',
    sessionScoped: true,
    mutates: false,
    async handler(_params, ctx): Promise<number> {
        const { user } = ctx;
        const userId = subjectId(user);

        return notificationRepository.countByUser(userId);
    },
});
