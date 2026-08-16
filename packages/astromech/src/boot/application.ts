/**
 * The application instance — one front door to a booted Astromech.
 *
 * `createAstromech` initialises and `getAstromech` only ever reads, so there is
 * exactly one place a runtime starts.
 */

import type {
    AstromechConfig,
    MediaService,
    NotificationsService,
    PluginServiceNamespace,
    ResolvedConfig,
    SettingsService,
    TypedEntriesService,
    UsersService,
} from '@/types/index';
import { runBootPhases } from '@/boot/lifecycle';
import { getSchedulerDriver } from '@/cron/registry';
import { onTick } from '@/cron/runner';
import { Astromech as services } from '@/transport/local/index';
import { createRegistry } from '@/utilities/registry';

export type Astromech = {
    config: ResolvedConfig;

    entries: TypedEntriesService;
    media: MediaService;
    users: UsersService;
    settings: SettingsService;
    notifications: NotificationsService;
    plugins: PluginServiceNamespace;

    /** Run the cron jobs due at `at`. Defaults to now. */
    scheduled(at?: Date): Promise<void>;

    /** The serving integration's terminal action. Idempotent. No-op on Workers. */
    startScheduler(): Promise<void>;
};

type Slot = { config: AstromechConfig; app: Promise<Astromech> };

// A `globalThis` slot rather than a module-level one: tsup emits several entry
// chunks, and a module-scoped memo is duplicated per chunk, so two chunks would
// each boot their own runtime.
const slot = createRegistry<Slot>('application', { required: false });

/**
 * Initialise. The slot is filled synchronously with the in-flight promise, so a
 * concurrent second caller never starts a second boot. A second call with the
 * same config returns the existing instance and a different one throws — a
 * Worker exports `fetch` and `scheduled` from one isolate and either can be
 * first. A failed boot clears the slot, so the next caller retries.
 */
export function createAstromech(options: {
    config: AstromechConfig;
}): Promise<Astromech> {
    const existing = slot.peek();
    if (existing !== null) {
        if (existing.config !== options.config) {
            throw new Error(
                '[Astromech] createAstromech() was called with a different config than ' +
                    'the one this process was created with. A process holds one application.'
            );
        }
        return existing.app;
    }

    const app = boot(options.config).catch((error: unknown) => {
        slot.clear();
        throw error;
    });
    slot.set({ config: options.config, app });
    return app;
}

/** The created application. Never creates one; throws when none exists. */
export function getAstromech(): Promise<Astromech> {
    const existing = slot.peek();
    if (existing === null) {
        throw new Error(
            '[Astromech] no application has been created. An integration calls ' +
                'createAstromech({ config }) before anything reads the app.'
        );
    }
    return existing.app;
}

/** Run the phases, then assemble the instance from what they registered. */
async function boot(config: AstromechConfig): Promise<Astromech> {
    const resolved = await runBootPhases(config);

    return {
        config: resolved,
        entries: services.entries,
        media: services.media,
        users: services.users,
        settings: services.settings,
        notifications: services.notifications,
        plugins: services.plugins,
        scheduled: (at?: Date): Promise<void> => onTick(at ?? new Date()),
        startScheduler: async (): Promise<void> => {
            await getSchedulerDriver()?.start(onTick);
        },
    };
}
