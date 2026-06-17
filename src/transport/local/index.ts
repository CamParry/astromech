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
import type { AstromechClient, TypedEntriesApi } from '@/types/index.js';
import { usersApi } from '@/services/users/service.js';
import { entries, initServerContext } from '@/services/entries/service.js';
import { mediaApi } from '@/services/media/service.js';
import { settingsApi } from '@/settings/index.js';
import { setCurrentUser } from '@/services/_shared/context.js';
import { setPluginSdkClient } from '@/plugins/runtime/plugin-runtime.js';
import { localPlugins } from '@/transport/local/plugins.js';

export { initServerContext, setCurrentUser };

// ============================================================================
// Assemble the Local API
// ============================================================================

export const Astromech: AstromechClient = {
    entries: entries as unknown as TypedEntriesApi,
    media: mediaApi,
    settings: settingsApi,
    users: usersApi,
    config,
    plugins: localPlugins,
    configure(_options: { baseUrl: string }): void {
        // No-op for the Local API — direct DB access does not use a base URL.
    },
};

// Register the client so plugin contexts can reach `ctx.sdk` without a static
// import cycle (plugin-runtime → transport/local → plugin-runtime).
setPluginSdkClient(Astromech);

export default Astromech;
