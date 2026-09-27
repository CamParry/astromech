import type { Notification } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { subjectId } from '../internal/subject';
import { notificationRepository } from '../repository';
import { notificationSchema } from '../schema';

/** Lists only the signed-in user's rows, and throws with nobody signed in. */
export const listNotifications = defineServiceMethod({
    summary: 'List your own notifications, newest first.',
    input: z.strictObject({}),
    output: z.array(notificationSchema),
    access: 'public',
    sessionScoped: true,
    mutates: false,
    async handler(_params, ctx): Promise<Notification[]> {
        const { user } = ctx;
        const userId = subjectId(user);

        return notificationRepository.findByUser(userId);
    },
});
