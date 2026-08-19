/**
 * Notifications service method contracts — declared subject + effect per verb.
 * The single source the manifest reads and the scoped handle enforces against.
 *
 * All four are `sessionScoped`: they act on the caller's own rows, so `userId`
 * is filled from the request context and is absent from every `input` schema —
 * it is not the caller's to pass. None declares a permission, because reaching
 * your own notifications is not a grant anyone hands out; having a session is
 * the whole of the authority. `decisions/0037` is the record.
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
