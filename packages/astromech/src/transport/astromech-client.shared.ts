/**
 * `AstromechClient` — the contract both transports implement.
 *
 * It is a TRANSPORT contract, not a leaf one: it composes the five domain
 * services into the one object a caller consumes, and it has exactly two
 * implementations, `transport/local/index.ts` (in-process) and
 * `transport/http/client/index.ts` (over the wire). It lives beside them rather
 * than in `types/`, where composing all five forced the pure leaf to hold
 * coupling the DAG forbids anywhere else.
 *
 * The `.shared.ts` marker is what lets the fetch client hold it: the type is
 * erased at build time and names nothing but leaves, and
 * `shared-files-stay-browser-safe` keeps it that way.
 *
 * The lowercase `astromechClient` is the fetch implementation of this type, not
 * this declaration — see `transport/http/client/index.ts`.
 */

import type { ResolvedConfig } from '@/types/config';
import type { PluginServiceNamespace } from '@/types/plugins';
import type {
    MediaService,
    NotificationsService,
    SettingsService,
    UsersService,
} from '@/types/services';
import type { TypedEntriesService } from '@/types/typed-entries';

export type AstromechClient = {
    entries: TypedEntriesService;
    media: MediaService;
    settings: SettingsService;
    users: UsersService;
    notifications: NotificationsService;
    config: ResolvedConfig;
    /**
     * Plugin RPC methods — `Astromech.plugins.<name>.<method>(input)`.
     * Always present: both transports assemble a namespace whose lookups are
     * lazy, so an uninstalled plugin resolves to `undefined` a level down rather
     * than leaving the namespace itself absent.
     */
    plugins: PluginServiceNamespace;
    configure(options: { baseUrl: string }): void;
};
