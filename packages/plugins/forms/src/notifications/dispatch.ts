/**
 * Routes a submission to every enabled notification an editor configured on the
 * form. Runs after the row is committed, so each delivery is caught and logged
 * rather than thrown back to the caller.
 */

import type { Entry, Field, PluginContext } from 'astromech';
import { entryFields } from '../utilities/form-entry';
import { toValueRows } from '../utilities/values';
import { mergeTagValues } from './merge-tags';
import { NOTIFICATION_PROVIDERS } from './registry';
import type { NotificationContext, StoredNotification } from './types';

export const NOTIFICATIONS_FIELD = 'notifications';

/** Deliver every enabled notification on the form for one submission. */
export async function sendNotifications(
    form: Entry,
    definitions: Field[],
    values: Record<string, unknown>,
    ctx: PluginContext
): Promise<void> {
    const configured = enabledNotifications(entryFields(form)[NOTIFICATIONS_FIELD]);
    if (configured.length === 0) return;

    const submittedAt = new Date().toISOString();
    const context: NotificationContext = {
        form,
        definitions,
        values,
        rows: toValueRows(definitions, values),
        tags: mergeTagValues(values, { formTitle: form.title, submittedAt }),
        submittedAt,
        ctx,
    };

    for (const config of configured) {
        const provider = NOTIFICATION_PROVIDERS.find(
            (candidate) => candidate.type === config._type
        );
        if (provider === undefined) {
            ctx.logger.warn(`unknown notification type ${String(config._type)}`);
            continue;
        }
        try {
            await provider.deliver(config, context);
        } catch (error) {
            ctx.logger.error(`notification ${provider.type} failed`, error);
        }
    }
}

/** The stored blocks that are objects and not switched off in the editor. */
function enabledNotifications(stored: unknown): StoredNotification[] {
    if (!Array.isArray(stored)) return [];
    return stored.filter(
        (instance): instance is StoredNotification =>
            typeof instance === 'object' &&
            instance !== null &&
            !Array.isArray(instance) &&
            (instance as StoredNotification)._disabled !== true
    );
}
