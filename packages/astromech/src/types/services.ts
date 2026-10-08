/**
 * The service handles: every content service and the plugin namespace, as
 * `createServices` builds them, and the same with the typed entry and global
 * facades. Each service's own contract is declared in its module's
 * `service-types.ts`.
 */

import type { PluginServiceNamespace } from './plugins';
import type { EntriesService } from '@/entries/service-types';
import type { TypedEntriesService } from '@/entries/typed-entries';
import type { GlobalsService } from '@/globals/service-types';
import type { TypedGlobalsService } from '@/globals/typed-globals';
import type { MediaService } from '@/media/service-types';
import type { NotificationsService } from '@/notifications/service-types';
import type { SecurityService } from '@/security/service-types';
import type { UsersService } from '@/users/service-types';

/** Every content service and the plugin namespace: the handle `createServices` builds. */
export type Services = {
    /** Entry reads and writes, for any entry type. */
    entries: EntriesService;
    /** Global reads and writes, for any declared global. */
    globals: GlobalsService;
    /** Media items: store, transform, and serve. */
    media: MediaService;
    /** Users, roles, and authentication. */
    users: UsersService;
    /** Notifications for the acting user. */
    notifications: NotificationsService;
    /** The block list and allow list. */
    security: SecurityService;
    /** The services each installed plugin exposes, namespaced by plugin. */
    plugins: PluginServiceNamespace;
};

/**
 * `Services` with `entries` and `globals` under their typed facades, which
 * narrow a result by the site's generated entry types and global keys.
 */
export type TypedServices = Omit<Services, 'entries' | 'globals'> & {
    entries: TypedEntriesService;
    globals: TypedGlobalsService;
};
