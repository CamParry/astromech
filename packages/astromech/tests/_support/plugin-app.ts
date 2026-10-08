/**
 * A plugin registered for real on a fresh harness database, with typed handles
 * on its service, the content and users services, the admin config and the
 * HTTP API, so a plugin's tests reach core one way.
 */
import type { DB } from '@/database/types';
import type { EntriesService } from '@/entries/service-types';
import type { GlobalsService } from '@/globals/service-types';
import type { MediaService } from '@/media/service-types';
import type { AdminConfig } from '@/types/config';
import type {
    AstromechConfig,
    AstromechPluginServices,
    PluginContext,
    ResolvedConfig,
    Role,
    User,
} from '@/types/index';
import type { UsersService } from '@/users/service-types';
import type { Kysely } from 'kysely';
import { createTestDb, requestAs, setupTestConfig } from '@tests/harness';
import { createAppContext, systemAppContext } from '@/app-context/app-context';
import { createServices, currentServices } from '@/app-context/services';
import { setMethodManifest } from '@/codegen/manifest-registry';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { buildAdminConfig } from '@/config/admin-config';
import { createPluginContext, getPluginIdentity } from '@/plugins/runtime/plugin-runtime';
import { createHttpApp } from '@/transport/http/app';

/** The service key of an installed plugin, as its `AstromechPluginServices` augmentation names it. */
type PluginKey = keyof AstromechPluginServices & string;

/** What `createPluginTestApp` returns. */
export type PluginTestApp<K extends PluginKey> = {
    /** The test database, which already holds every first-party plugin's tables. */
    db: Kysely<DB>;
    /** The resolved config the app runs. */
    config: ResolvedConfig;
    /** What the site serves the admin: each plugin's nav, pages and resources among it. */
    adminConfig: AdminConfig;
    /**
     * The plugin's service on the trusted handle, the way site code calls it.
     * Read on each access, so it follows a later `setupTestConfig`.
     */
    readonly service: AstromechPluginServices[K];
    /**
     * The plugin's service on a handle scoped to `role`, the way a transport
     * calls it, so a method's `access` is enforced.
     */
    as(role: Role | null, user?: User | null): AstromechPluginServices[K];
    /** The entries service on the trusted handle. */
    entries: EntriesService;
    /** The globals service on the trusted handle. */
    globals: GlobalsService;
    /** The media service on the trusted handle. */
    media: MediaService;
    /** The users service on the trusted handle. */
    users: UsersService;
    /** The `ctx` the plugin's own code receives, acting as the system. */
    context(): PluginContext;
    /**
     * Send a request to the app's API. `path` is relative to `{basePath}/api`.
     * The request carries no session, so the app sees an anonymous caller,
     * unless `init.as` names the signed-in user and role to send it as.
     */
    request(method: string, path: string, init?: TestRequestInit): Promise<Response>;
};

/** The body, headers and caller of a `PluginTestApp.request`. */
export type TestRequestInit = {
    /** Sent as JSON, with a JSON `Content-Type`. A string is sent as it is, so a test can send malformed JSON. */
    body?: unknown;
    headers?: Record<string, string>;
    /**
     * The caller, set through the harness's `requestAs` on the real request
     * scope, the way the session middleware sets a signed-in user and role.
     */
    as?: { user: User | null; role: Role | null };
};

/**
 * Open a fresh test database, publish `config` and register its plugins the
 * way `setupTestConfig` does, publish the method manifest the way boot does,
 * and return handles on the plugin whose service key is `key`. Throws when
 * `config` installs no such plugin.
 */
export async function createPluginTestApp<K extends PluginKey>(
    key: K,
    config: AstromechConfig
): Promise<PluginTestApp<K>> {
    const db = await createTestDb();
    const resolved = setupTestConfig(config);
    // `ctx.methods.tools` builds a plugin's tool surface from the manifest.
    setMethodManifest(generateMethodManifest(resolved, config.plugins ?? []));
    const identity = getPluginIdentity(key);
    if (identity === undefined) {
        throw new Error(`the config installs no plugin with the service key '${key}'`);
    }
    let http: ReturnType<typeof createHttpApp> | undefined;

    return {
        db,
        config: resolved,
        adminConfig: buildAdminConfig(config, resolved),
        get service() {
            return pluginService(currentServices.plugins, key);
        },
        as: (role, user = null) =>
            pluginService(
                createServices(createAppContext({ user, role }), {
                    overrideAccess: false,
                }).plugins,
                key
            ),
        entries: currentServices.entries,
        globals: currentServices.globals,
        media: currentServices.media,
        users: currentServices.users,
        context: () => createPluginContext(identity, systemAppContext()),
        request: async (method, path, init = {}) => {
            http ??= createHttpApp(resolved);
            const headers = { ...init.headers };
            if (init.body !== undefined) headers['Content-Type'] = 'application/json';
            const url = `${resolved.basePath}/api${path}`;
            const requestInit: RequestInit = {
                method,
                headers,
                ...(init.body === undefined
                    ? {}
                    : {
                          body:
                              typeof init.body === 'string'
                                  ? init.body
                                  : JSON.stringify(init.body),
                      }),
            };
            return init.as === undefined
                ? http.request(url, requestInit)
                : requestAs(http, init.as, url, requestInit);
        },
    };
}

/** The plugin's slice of a handle's `plugins` namespace, typed by its augmentation. */
function pluginService<K extends PluginKey>(
    plugins: Record<string, unknown>,
    key: K
): AstromechPluginServices[K] {
    const service = plugins[key];
    if (service === undefined) throw new Error(`no service is registered for '${key}'`);
    return service as AstromechPluginServices[K];
}
