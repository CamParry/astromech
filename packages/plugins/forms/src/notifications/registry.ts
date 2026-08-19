/**
 * The notification kinds this plugin ships. Adding a provider here adds both a
 * block to the form editor and a delivery path to `sendNotifications`.
 */

import type { NotificationProvider } from './types';
import type { Block } from 'astromech';
import { emailNotification } from './providers/email';

export const NOTIFICATION_PROVIDERS: readonly NotificationProvider[] = [
    emailNotification,
];

/** The block definitions the form entry type composes its notifications field from. */
export const notificationBlocks: Block[] = NOTIFICATION_PROVIDERS.map(
    (provider) => provider.block
);
