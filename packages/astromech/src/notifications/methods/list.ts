import type { Notification } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { subjectId } from '../internal/subject';
import { notificationRepository } from '../repository';
import { notificationSchema } from '../schema';

/** The caller's own undismissed notifications, newest first. */
export const listNotifications = defineServiceMethod({
    summary: 'List your own notifications, newest first.',
    input: z.strictObject({}),
    output: z.array(notificationSchema),
    access: 'public',
    sessionScoped: true,
    mutates: false,
    async handler(_params, ctx): Promise<Notification[]> {
        return notificationRepository.findByUser(subjectId(ctx.user));
    },
});
