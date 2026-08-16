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

import { getConfig } from '@/config/registry';
import type { ResolvedConfig, TypedEntriesService } from '@/types/index';
import type { AstromechClient } from '@/transport/astromech-client.shared';
import { usersService } from '@/users/index';
import { entriesService } from '@/entries/index';
import { mediaService } from '@/media/index';
import { settingsService } from '@/settings/index';
import { runWithContext } from '@/request-context/index';
import { setPluginClient, setPluginMethods } from '@/plugins/runtime/plugin-runtime';
import { localNotificationsService } from '@/transport/local/notifications';
import { localPlugins } from '@/transport/local/plugins';
import { buildScopedTools } from '@/transport/tools/scoped-tools';

export { runWithContext };

// ============================================================================
// Assemble the Local API
// ============================================================================

/** The shared `AstromechClient` contract, backed by the in-process services. */
export const Astromech: AstromechClient = {
    entries: entriesService as unknown as TypedEntriesService,
    media: mediaService,
    settings: settingsService,
    users: usersService,
    notifications: localNotificationsService,
    get config(): ResolvedConfig {
        return getConfig();
    },
    plugins: localPlugins,
    configure(_options: { baseUrl: string }): void {
        // No-op for the Local API — direct DB access does not use a base URL.
    },
};

// Register the client so plugin contexts can reach the flattened domains
// (`ctx.entries`, `ctx.media`, …) without a static import cycle
// (plugin-runtime → transport/local → plugin-runtime).
setPluginClient(Astromech);

// The plugin runtime sits below the transports, so the implementation of its
// `tools` port is injected from up here.
setPluginMethods({ tools: buildScopedTools });

export default Astromech;
