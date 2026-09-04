/**
 * `AppContext` — what a service method's handler runs with. The plugin layer
 * (`PluginContext` in `./plugins`) is this plus a plugin's own identity,
 * config view and namespaced ports.
 */

import type { ResolvedConfig } from './config';
import type { NotifyInput, Role, User } from './domain';
import type { HookEvent, HookPayloadFor } from './hooks';
import type { PluginDatabase, PluginEmail, PluginLogger, PluginMethods } from './plugins';
import type {
    EntriesService,
    GlobalsService,
    MediaService,
    NotificationsService,
    SettingsService,
    UsersService,
} from './services';
import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';

/** Everything a service method's handler runs with. */
export type AppContext = {
    /** The query handle; a getter, so it joins an open `transaction(fn)`. */
    readonly db: Kysely<DB>;
    config: ResolvedConfig;
    /** The acting user, or null for unauthenticated / system contexts. */
    user: User | null;
    /**
     * The acting user's role, or null outside a request context. Fixed when the
     * context is built, and passed straight to `scopedServices`.
     */
    role: Role | null;
    /**
     * The connecting address, set by the HTTP transport when the runtime exposes
     * one it can trust. Absent for a CLI, MCP or in-process caller, and absent
     * over HTTP where no trustworthy source exists — so it is an identity to
     * meter traffic by, never proof of who the caller is.
     */
    clientAddress?: string | undefined;
    entries: EntriesService;
    globals: GlobalsService;
    media: MediaService;
    settings: SettingsService;
    users: UsersService;
    /** Session-scoped: acts for `user`. */
    notifications: NotificationsService;
    /** Email port — the element is rendered here, and an unconfigured driver throws. */
    email: PluginEmail;
    notify: (input: NotifyInput) => Promise<void>;
    logger: PluginLogger;
    /** Env vars (resolved via import.meta.env in Vite/Astro SSR). Never the browser. */
    env: Record<string, string | undefined>;
    /**
     * Run `event`'s handlers in registration order, replacing the payload with
     * any non-`undefined` return; a handler throw propagates to the caller
     * (`DECISIONS.md`).
     */
    runHook: <E extends HookEvent>(
        event: E,
        payload: HookPayloadFor<E>
    ) => Promise<HookPayloadFor<E>>;
    /** Database maintenance capabilities (feature-detected per driver). Distinct from `db` (the query instance). */
    database: PluginDatabase;
    /** The method manifest as a dispatch table, already scoped to `role`. */
    methods: PluginMethods;
};
