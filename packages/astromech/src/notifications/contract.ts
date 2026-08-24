/**
 * Notifications service method contracts — declared subject + effect per
 * verb. All four are `sessionScoped`: they act on the caller's own rows, so
 * `userId` is filled from context, not passed. See `DECISIONS.md`.
 */

import type { ServiceMethodContract } from '@/types/index';
import { z } from '@hono/zod-openapi';

export const notificationsContract = {
    list: {
        summary: 'List your own notifications, newest first.',
        input: z.object({}),
        sessionScoped: true,
        mutates: false,
    },
    count: {
        summary: 'Count your own undismissed notifications.',
        input: z.object({}),
        sessionScoped: true,
        mutates: false,
    },
    dismiss: {
        summary: 'Dismiss one of your own notifications.',
        input: z.object({ id: z.string() }),
        sessionScoped: true,
        mutates: true,
        destructive: true,
        idempotent: true,
    },
    dismissAll: {
        summary: 'Dismiss every one of your own notifications.',
        input: z.object({}),
        sessionScoped: true,
        mutates: true,
        destructive: true,
        idempotent: true,
    },
} satisfies Record<string, ServiceMethodContract>;
