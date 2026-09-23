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
    TypedEntriesService,
    TypedGlobalsService,
    UsersService,
} from '@/types/index';
import { currentAppContext } from '@/app-context/app-context';
import { entriesDefinition } from '@/entries/service';
import { globalsDefinition } from '@/globals/service';
import { mediaDefinition } from '@/media/service';
import { notificationsDefinition } from '@/notifications/service';
import { usersDefinition } from '@/users/service';

/** The `AppContext` members that hold a bound core service. */
type ServiceKey = 'entries' | 'globals' | 'media' | 'users' | 'notifications';

/** Each core service's definition, under the `AppContext` member that binds it. */
const DEFINITIONS = {
    entries: entriesDefinition,
    globals: globalsDefinition,
    media: mediaDefinition,
    users: usersDefinition,
    notifications: notificationsDefinition,
} satisfies Record<ServiceKey, { catalogue: object }>;

/**
 * The service `key` names, each call made on the one `currentAppContext()`
 * already holds, so a request's calls share its binding.
 */
export function bindCurrent<K extends ServiceKey>(key: K): AppContext[K] {
    const bound: Record<string, (input: unknown) => Promise<unknown>> = {};
    for (const method of Object.keys(DEFINITIONS[key].catalogue)) {
        bound[method] = async (input) => {
            const service = (await currentAppContext())[key] as unknown as Record<
                string,
                (input: unknown) => unknown
            >;
            return service[method]?.(input);
        };
    }
    return bound as unknown as AppContext[K];
}

/** The entries service, acting as whoever the current request is. */
export const entriesService: EntriesService = bindCurrent('entries');

/** `entriesService` under its typed facade — build consumer handles from it. */
export const typedEntriesService = entriesService as unknown as TypedEntriesService;

/** The globals service, acting as whoever the current request is. */
export const globalsService: GlobalsService = bindCurrent('globals');

/** `globalsService` under its typed facade; the one acknowledged place the cast happens. */
export const typedGlobalsService = globalsService as unknown as TypedGlobalsService;

/** The notifications service, acting for whoever the current request is. */
export const notificationsService: NotificationsService = bindCurrent('notifications');

/** The users service, acting as whoever the current request is. */
export const usersService: UsersService = bindCurrent('users');

/** The media service, acting as whoever the current request is. */
export const mediaService: MediaService = bindCurrent('media');
