/**
 * Client-access port (dependency inversion).
 *
 * The plugin runtime is a capability and must not import the domains it hands a
 * plugin. It declares the slice it needs here instead, typed only from the
 * leaves: the six service handles it flattens onto `PluginContext`, and nothing
 * else. `plugin-access.ts` fills the slot via `setPluginClient`, so the
 * application instance itself — with its `config`, `fetch` and `scheduled` —
 * never reaches a plugin.
 *
 * Same inversion as `entry-access.ts` and `notify-access.ts`. It carries no
 * registry of its own because the slot already exists on the runtime's state.
 */

import type {
    MediaService,
    NotificationsService,
    PluginServiceNamespace,
    SettingsService,
    TypedEntriesService,
    UsersService,
} from '@/types/index';

export type ClientAccess = {
    entries: TypedEntriesService;
    media: MediaService;
    settings: SettingsService;
    users: UsersService;
    notifications: NotificationsService;
    plugins: PluginServiceNamespace;
};
