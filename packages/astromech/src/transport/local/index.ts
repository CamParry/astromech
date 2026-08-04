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
    ContentApi,
    NotificationsApi,
    TypedEntriesApi,
} from '@/types/index.js';
import { usersApi } from '@/users/index.js';
import { entries } from '@/entries/index.js';
import { mediaApi } from '@/media/index.js';
import { settingsApi } from '@/settings/index.js';
import { contentApi } from '@/content/index.js';
import { runWithContext } from '@/request-context/index.js';
import { setPluginClient, setPluginMethods } from '@/plugins/runtime/plugin-runtime.js';
import { localPlugins } from '@/transport/local/plugins.js';
import { buildScopedTools } from '@/transport/mcp/scoped-tools.js';

export { runWithContext };

// ============================================================================
// Assemble the Local API
// ============================================================================

const notImplemented = (): never => {
    throw new Error(
        '[Astromech] notifications are session-scoped and not available in the in-process client; use ctx.notify to emit, or the HTTP API to read.'
    );
};

const localNotificationsApi: NotificationsApi = {
    list: notImplemented,
    count: notImplemented,
    dismiss: notImplemented,
    dismissAll: notImplemented,
};

/**
 * The local client carries `content` on top of the shared contract: the content
 * operations run in-process only, so the fetch Client has nothing to offer for
 * them and `AstromechClient` must not claim they are there.
 */
export const Astromech: AstromechClient & { content: ContentApi } = {
    entries: entries as unknown as TypedEntriesApi,
    media: mediaApi,
    settings: settingsApi,
    users: usersApi,
    content: contentApi,
    notifications: localNotificationsApi,
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
