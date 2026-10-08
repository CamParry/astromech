/**
 * The notifications service contract: what `app.notifications` offers.
 * `service.ts` binds the definition that implements it.
 */

import type { Notification } from '@/types/domain';

/**
 * The notifications API. No `userId` anywhere: every method acts on the caller's
 * own rows, and the subject comes from the context a method is bound to — a
 * client's session, or the signed-in user of the request a server call is made
 * in.
 */
export type NotificationsService = {
    list(): Promise<Notification[]>;
    count(): Promise<number>;
    dismiss(params: { id: string }): Promise<void>;
    dismissAll(): Promise<void>;
};
