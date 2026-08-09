/**
 * Client-access port (dependency inversion).
 *
 * The plugin runtime is a capability and must not import the transport layer,
 * where `AstromechClient` is declared. What it actually needs is narrower than
 * that contract: the six service handles it flattens onto `PluginContext`, and
 * none of `config` or `configure`. So the runtime declares that slice here,
 * typed only from the leaves, and the Local API injects an `AstromechClient`
 * into it at module load via `setPluginClient` — structurally, with no import
 * either way.
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
