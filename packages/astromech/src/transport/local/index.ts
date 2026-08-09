/**
 * Astromech Local API
 *
 * The local transport: assembles the bare service methods into the ergonomic
 * nested `Astromech` object for in-process use in Astro server-side code.
 * Import from 'astromech/local'.
 *
 * Trusted transport — it composes no permissions wrapper (the HTTP API is the
 * enforcement boundary). It only projects services into a consumption shape.
 */

import config from 'virtual:astromech/config';
import type {
    AstromechClient,
    NotificationsService,
    TypedEntriesService,
} from '@/types/index';
import { usersService } from '@/users/index';
import { entriesService } from '@/entries/index';
import { mediaService } from '@/media/index';
import { settingsService } from '@/settings/index';
import { runWithContext } from '@/request-context/index';
import { setPluginClient, setPluginMethods } from '@/plugins/runtime/plugin-runtime';
import { localPlugins } from '@/transport/local/plugins';
import { buildScopedTools } from '@/transport/tools/scoped-tools';

export { runWithContext };

// ============================================================================
// Assemble the Local API
// ============================================================================

const notImplemented = (): never => {
    throw new Error(
        '[Astromech] notifications are session-scoped and not available in the in-process client; use ctx.notify to emit, or the HTTP API to read.'
    );
};

const localNotificationsService: NotificationsService = {
    list: notImplemented,
    count: notImplemented,
    dismiss: notImplemented,
    dismissAll: notImplemented,
};

/** The shared `AstromechClient` contract, backed by the in-process services. */
export const Astromech: AstromechClient = {
    entries: entriesService as unknown as TypedEntriesService,
    media: mediaService,
    settings: settingsService,
    users: usersService,
    notifications: localNotificationsService,
    config,
    plugins: localPlugins,
    configure(_options: { baseUrl: string }): void {
        // No-op for the Local API — direct DB access does not use a base URL.
    },
};

// Register the client so plugin contexts can reach the flattened domains
// (`ctx.entries`, `ctx.media`, …) without a static import cycle
// (plugin-runtime → transport/local → plugin-runtime).
setPluginClient(Astromech);

// Wired here, not at boot: the port's implementation must belong to the module
// graph that can resolve `virtual:`, and this module is evaluated in it.
setPluginMethods({ tools: buildScopedTools });

export default Astromech;
