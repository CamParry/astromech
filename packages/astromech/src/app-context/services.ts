/**
 * The bound form of a service definition: the interface, with every call made
 * against the context of the request it is made in.
 */

import type {
    AppContext,
    EntriesService,
    GlobalsService,
    MediaService,
    NotificationsService,
    ServiceDefinition,
    SettingsService,
    TypedEntriesService,
    TypedGlobalsService,
    UsersService,
} from '@/types/index';
import { currentAppContext } from '@/app-context/app-context';
import { entriesDefinition } from '@/entries/service';
import { globalsDefinition } from '@/globals/service';
import { mediaDefinition } from '@/media/service';
import { notificationsDefinition } from '@/notifications/service';
import { settingsDefinition } from '@/settings/service';
import { usersDefinition } from '@/users/service';

/**
 * The interface, each call bound to `currentAppContext()`. One binding per
 * context, so a request's calls share the objects `bind` builds.
 */
export function bindCurrent<S extends object>(definition: ServiceDefinition<S>): S {
    const byContext = new WeakMap<AppContext, S>();
    const forContext = (context: AppContext): S => {
        const existing = byContext.get(context);
        if (existing) return existing;
        const service = definition.bind(context);
        byContext.set(context, service);
        return service;
    };

    const bound: Record<string, (input: unknown) => Promise<unknown>> = {};
    for (const key of Object.keys(definition.catalogue)) {
        bound[key] = async (input) => {
            const service = forContext(await currentAppContext()) as Record<
                string,
                (input: unknown) => unknown
            >;
            return service[key]?.(input);
        };
    }
    return bound as S;
}

/**
 * The entries service, acting as whoever the current request is. `EntriesMethods`
 * collapses the overload pairs `EntriesService` declares, so the catalogue can be
 * checked against a shape the handlers implement; this is one of the two
 * acknowledged places the cast back happens.
 */
export const entriesService: EntriesService = bindCurrent(
    entriesDefinition
) as unknown as EntriesService;

/** `entriesService` under its typed facade — build consumer handles from it. */
export const typedEntriesService = entriesService as unknown as TypedEntriesService;

/** The globals service, acting as whoever the current request is. */
export const globalsService: GlobalsService = bindCurrent(globalsDefinition);

/** `globalsService` under its typed facade; the one acknowledged place the cast happens. */
export const typedGlobalsService = globalsService as unknown as TypedGlobalsService;

/** The settings service, acting as whoever the current request is. */
export const settingsService: SettingsService = bindCurrent(settingsDefinition);

/** The notifications service, acting for whoever the current request is. */
export const notificationsService: NotificationsService = bindCurrent(
    notificationsDefinition
);

/** The users service, acting as whoever the current request is. */
export const usersService: UsersService = bindCurrent(usersDefinition);

/** The media service, acting as whoever the current request is. */
export const mediaService: MediaService = bindCurrent(mediaDefinition);
