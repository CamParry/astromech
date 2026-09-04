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
import { entriesService } from '@/entries/service';
import { getEnvRecord } from '@/env';
import { AstromechError } from '@/errors/astromech-error';
import { globalsService } from '@/globals/service';
import { runHook } from '@/hooks/hooks';
import { mediaService } from '@/media/service';
import { currentUserNotificationsService } from '@/notifications/current-user-service';
import { notify } from '@/notifications/service';
import {
    getCurrentRole,
    getCurrentUser,
    getRequestContext,
} from '@/request-context/request-context';
import { settingsService } from '@/settings/service';
import { buildScopedTools } from '@/transport/tools/scoped-tools';
import { usersService } from '@/users/service';
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

    return {
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
            return entriesService;
        },
        get globals(): GlobalsService {
            return globalsService;
        },
        get media(): MediaService {
            return mediaService;
        },
        get settings(): SettingsService {
            return settingsService;
        },
        get users(): UsersService {
            return usersService;
        },
        get notifications(): NotificationsService {
            return currentUserNotificationsService;
        },
        email: { send: sendEmail },
        notify,
        logger: log,
        get env(): Record<string, string | undefined> {
            return getEnvRecord();
        },
        runHook: (event, payload) => runHook(event, payload),
        get methods(): PluginMethods {
            return {
                tools: (options) => buildScopedTools(role, options),
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
}

/**
 * The context for the current request, built once from the request store and
 * cached on it; a system context (user and role null) outside one. The only
 * place below a transport that reads the store.
 */
export async function currentAppContext(): Promise<AppContext> {
    const requestContext = getRequestContext();
    if (requestContext === undefined) {
        return createAppContext({ user: null, role: null });
    }
    if (requestContext.app !== undefined) return requestContext.app;

    const [user, role] = await Promise.all([getCurrentUser(), getCurrentRole()]);
    const app = createAppContext({ user, role });
    requestContext.app = app;
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
