import type { Notification } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { subjectId } from '../internal/subject';
import { toNotification } from '../internal/to-notification';
import { notificationRepository } from '../repository';

/** The caller's own undismissed notifications, newest first. */
export const listNotifications = defineServiceMethod({
    summary: 'List your own notifications, newest first.',
    input: z.object({}),
    access: 'public',
    sessionScoped: true,
    mutates: false,
    async handler(_params, ctx): Promise<Notification[]> {
        const rows = await notificationRepository.findByUser(subjectId(ctx.user));
        return rows.map(toNotification);
    },
});
