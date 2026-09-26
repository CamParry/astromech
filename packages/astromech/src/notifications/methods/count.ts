import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { subjectId } from '../internal/subject';
import { notificationRepository } from '../repository';

/** How many undismissed notifications the caller has. */
export const countNotifications = defineServiceMethod({
    summary: 'Count your own undismissed notifications.',
    input: z.object({}),
    output: z.number(),
    access: 'public',
    sessionScoped: true,
    mutates: false,
    async handler(_params, ctx): Promise<number> {
        return notificationRepository.countByUser(subjectId(ctx.user));
    },
});
