/**
 * Notifications service — the per-user inbox verbs, plus the privileged
 * server-side `notify()` emit. A thin assembler: it wires `methods/**` into
 * the `NotificationsService` definition, where every verb acts for the
 * context's own user and filtering on that id is the authorization.
 *
 * `notify` sits beside the definition rather than in it: the caller chooses
 * the recipients, so it is a privileged emit and not a method anyone may call.
 */

import type { NotificationsService, NotifyInput } from '@/types/index';
import { defineService } from '@/services/define-service';
import { createUserRepository } from '@/users/repository';
import { countNotifications } from './methods/count';
import { dismissNotification } from './methods/dismiss';
import { dismissAllNotifications } from './methods/dismiss-all';
import { listNotifications } from './methods/list';
import { createNotificationRepository } from './repository';

export const notificationsDefinition = defineService<NotificationsService>(
    'notifications',
    {
        list: listNotifications,
        count: countNotifications,
        dismiss: dismissNotification,
        dismissAll: dismissAllNotifications,
    }
);

/**
 * Deliver one notification to every user the target names. Privileged: the
 * caller chooses the recipients, so this is server-side only and reaches no
 * session.
 */
export async function notify(input: NotifyInput): Promise<void> {
    const users = createUserRepository();

    let userIds: string[];

    if ('user' in input.target) {
        userIds = [input.target.user];
    } else if ('role' in input.target) {
        userIds = await users.owners.pluck('id', {
            where: { role: input.target.role },
        });
    } else {
        userIds = await users.owners.pluck('id');
    }

    if (userIds.length === 0) return;

    await createNotificationRepository().createMany(
        userIds.map((userId) => ({
            userId,
            type: input.type,
            title: input.title,
            message: input.message,
            href: input.href ?? null,
        }))
    );
}
