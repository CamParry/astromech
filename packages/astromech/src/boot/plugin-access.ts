/**
 * Injects the two ports a plugin context is built from: the six domain handles
 * it flattens (`plugins/runtime/client-access.ts`) and the tool builder behind
 * `ctx.methods` (`PluginMethodsAccess`). Both implementations sit above the
 * plugin runtime — the domains and `transport/tools/` — so the composition root
 * hands them down.
 *
 * Exposed as an explicit `wirePluginAccess()` CALL rather than an import
 * side-effect: the package is `sideEffects: false`, so a bare
 * `import './plugin-access'` would be tree-shaken out of the build and the ports
 * would never register. `runBootPhases` calls this once before `registerPlugins`,
 * next to `wireEntryAccess()` and `wireNotifyAccess()`.
 *
 * What is injected is the named slice, never the application instance: the six
 * handles carry no `config`, no `fetch` and no `scheduled`, so a plugin cannot
 * reach the live drivers or serve a request through the object it is handed.
 */

import { entriesService } from '@/entries/index';
import { mediaService } from '@/media/index';
import { currentUserNotificationsService } from '@/notifications/index';
import { settingsService } from '@/settings/index';
import { usersService } from '@/users/index';
import { pluginServices } from '@/plugins/runtime/plugin-services';
import { setPluginClient, setPluginMethods } from '@/plugins/runtime/plugin-runtime';
import { buildScopedTools } from '@/transport/tools/scoped-tools';
import type { TypedEntriesService } from '@/types/index';

/** Wire the client and methods ports into the plugin runtime. Idempotent. */
export function wirePluginAccess(): void {
    setPluginClient({
        entries: entriesService as unknown as TypedEntriesService,
        media: mediaService,
        settings: settingsService,
        users: usersService,
        notifications: currentUserNotificationsService,
        plugins: pluginServices,
    });
    setPluginMethods({ tools: buildScopedTools });
}
