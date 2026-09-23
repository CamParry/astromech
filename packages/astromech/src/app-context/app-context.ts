/**
 * The `AppContext` a service method's handler runs with, assembled here — the
 * other half of the composition root, beside `plugins/runtime/plugin-runtime.ts`.
 */

import type { DB } from '@/database/types';
import type {
    AppContext,
    EntriesService,
    GlobalsService,
    MediaService,
    NotificationsService,
    PluginDatabase,
    PluginMethods,
    ResolvedConfig,
    Role,
    SettingsService,
    User,
    UsersService,
} from '@/types/index';
import type { Kysely } from 'kysely';
import type { ReactElement } from 'react';
import { getConfig } from '@/config/registry';
import { getDatabaseDriver } from '@/database/driver-registry';
import { getDb } from '@/database/registry';
import { getEmailDriver } from '@/email/registry';
import { renderEmail } from '@/email/render';
import { entriesDefinition } from '@/entries/service';
import { getEnvRecord } from '@/env';
import { AstromechError } from '@/errors/astromech-error';
import { globalsDefinition } from '@/globals/service';
import { runHook } from '@/hooks/hooks';
import { mediaDefinition } from '@/media/service';
import { notificationsDefinition, notify } from '@/notifications/service';
import { createRegistry } from '@/registry';
import {
    getCurrentRole,
    getCurrentUser,
    getRequestScope,
} from '@/request-scope/request-scope';
import { settingsDefinition } from '@/settings/service';
import { buildScopedTools } from '@/transport/tools/scoped-tools';
import { usersDefinition } from '@/users/service';
import { log } from '@/utilities/log';

/** Who a context acts as, and where the call came from. */
export type AppContextInput = {
    user: User | null;
    role: Role | null;
    clientAddress?: string | undefined;
};

/**
 * One context, with the services bound to it. Every member that reaches a
 * registry is a getter, so a context can be built before the drivers are wired.
 */
export function createAppContext(input: AppContextInput): AppContext {
    const { user, role, clientAddress } = input;
    /** Bound once per context, so a handler reaching a sibling acts as this user. */
    let entries: EntriesService | undefined;
    let globals: GlobalsService | undefined;
    let media: MediaService | undefined;
    let notifications: NotificationsService | undefined;
    let settings: SettingsService | undefined;
    let users: UsersService | undefined;

    const context: AppContext = {
        get db(): Kysely<DB> {
            return getDb();
        },
        get config(): ResolvedConfig {
            return getConfig();
        },
        user,
        role,
        clientAddress,
        get entries(): EntriesService {
            // `EntriesMethods` collapses the overload pairs the interface
            // declares; `entries/service.ts` says why the cast is here.
            entries ??= entriesDefinition.bind(context) as unknown as EntriesService;
            return entries;
        },
        get globals(): GlobalsService {
            globals ??= globalsDefinition.bind(context);
            return globals;
        },
        get media(): MediaService {
            media ??= mediaDefinition.bind(context);
            return media;
        },
        get settings(): SettingsService {
            settings ??= settingsDefinition.bind(context);
            return settings;
        },
        get users(): UsersService {
            users ??= usersDefinition.bind(context);
            return users;
        },
        get notifications(): NotificationsService {
            notifications ??= notificationsDefinition.bind(context);
            return notifications;
        },
        email: { send: sendEmail },
        notify,
        logger: log,
        get env(): Record<string, string | undefined> {
            return getEnvRecord();
        },
        runHook: (event, payload) => runHook(event, payload, context),
        get methods(): PluginMethods {
            return {
                tools: (options) => buildScopedTools(context, options),
            };
        },
        get database(): PluginDatabase {
            // Probes rather than throws: a unit test builds a context without
            // ever wiring a db driver, and reads `dialect` from it.
            const driver = getDatabaseDriver();
            const dump = driver?.dump?.bind(driver);
            const restore = driver?.restore?.bind(driver);
            return {
                dialect: driver?.type ?? 'unknown',
                ...(dump ? { dump } : {}),
                ...(restore ? { restore } : {}),
            };
        },
    };

    return context;
}

const systemContext = createRegistry<AppContext>('systemAppContext', {
    required: false,
});

/**
 * The system context: no user, no role. Built once and reused, which is safe
 * because every member that reaches a registry reads it at call time.
 */
export function systemAppContext(): AppContext {
    const existing = systemContext.get();
    if (existing) return existing;
    const created = createAppContext({ user: null, role: null });
    systemContext.set(created);
    return created;
}

/**
 * The context for the current request, built once from the request scope and
 * cached on it; the system context outside one. The only place below a
 * transport that reads the scope.
 */
export async function currentAppContext(): Promise<AppContext> {
    const scope = getRequestScope();
    if (scope === undefined) return systemAppContext();
    if (scope.app !== undefined) return scope.app;

    const [user, role] = await Promise.all([getCurrentUser(), getCurrentRole()]);
    const app = createAppContext({ user, role, clientAddress: scope.clientAddress });
    scope.app = app;
    return app;
}

/** Backs `ctx.email.send`: render the element, then hand it to the configured driver. */
async function sendEmail(
    to: string,
    subject: string,
    element: ReactElement
): Promise<void> {
    const driver = getEmailDriver();
    if (!driver) {
        throw new AstromechError('Email is not configured; cannot send.');
    }
    const { html, text } = await renderEmail(element);
    await driver.send({ to, subject, html, text });
}
