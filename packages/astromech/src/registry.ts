/**
 * Registry — the primitive every subsystem registry is built on.
 *
 * Backed by `globalThis`, never a module-level singleton: the package ships two
 * separate tsup builds, and six `exports` subpaths can resolve to either `src`
 * or `dist`, so one module can be instantiated more than once in a process. The
 * global namespace is the only thing every copy shares. The application
 * registry in `src/astromech.ts` depends on that: two copies of it would boot
 * the runtime twice.
 */

import { AstromechError } from '@/errors/index';

/**
 * The shared namespace. Registries take arbitrary string keys; the named keys
 * are process guards, read directly rather than through a registry.
 * Their types are all built-ins, so naming them here imports nothing.
 */
type AstromechGlobals = Record<string, unknown> & {
    /** The cron ticker handle, so a repeated `start()` never stacks intervals. */
    cronInterval?: ReturnType<typeof setInterval> | undefined;
    /** In-process overlap guard for a cron tick. */
    cronTickRunning?: boolean | undefined;
    /** Cron job names already warned about as unscheduled. */
    cronUnscheduledWarned?: Set<string> | undefined;
    /** Module URL of the loaded admin UI barrel, for the duplicate-copy check. */
    uiInstance?: string | undefined;
};

declare global {
    var __astromech: AstromechGlobals | undefined;
}

/** The shared namespace, created on first touch. */
export function globals(): AstromechGlobals {
    return (globalThis.__astromech ??= {});
}

export type RequiredRegistry<T> = {
    set(value: T): void;
    /** The value. Throws when unset. */
    getOrThrow(): T;
    /** The value, or null when unset. */
    get(): T | null;
    /** Return the registry to its unset state. */
    clear(): void;
};

export type OptionalRegistry<T> = {
    set(value: T): void;
    /** The value, or null when unset. */
    get(): T | null;
    clear(): void;
};

export function createRegistry<T>(
    name: string,
    opts: { required: false; hint?: string }
): OptionalRegistry<T>;
export function createRegistry<T>(
    name: string,
    opts?: { required?: true; hint?: string }
): RequiredRegistry<T>;
export function createRegistry<T>(
    name: string,
    opts?: { required?: boolean; hint?: string }
): RequiredRegistry<T> {
    // Re-read the namespace on every access: tests reset it wholesale.
    return {
        set: (value: T): void => {
            globals()[name] = value;
        },
        getOrThrow: (): T => {
            const value = globals()[name];
            if (value === undefined) {
                const hint = opts?.hint === undefined ? '' : ` ${opts.hint}`;
                throw new AstromechError(`'${name}' is not configured.${hint}`);
            }
            return value as T;
        },
        get: (): T | null => (globals()[name] ?? null) as T | null,
        clear: (): void => {
            // Assign rather than `delete` — `get()` reads `?? null`, so an
            // undefined value is already indistinguishable from an absent one.
            globals()[name] = undefined;
        },
    };
}

export type KeyedRegistry<T> = {
    set(key: string, value: T): void;
    /** The entry. Throws when the key is unset. */
    getOrThrow(key: string): T;
    /** The entry, or null when the key is unset. */
    get(key: string): T | null;
    has(key: string): boolean;
    keys(): string[];
    /** Drop every entry, leaving the registry usable. */
    clear(): void;
};

/**
 * Many values under one registry name, backed by a `Map` — the same mechanism
 * as `createRegistry`, keyed.
 */
export function createKeyedRegistry<T>(name: string): KeyedRegistry<T> {
    const map = (): Map<string, T> => {
        const namespace = globals();
        namespace[name] ??= new Map<string, T>();
        return namespace[name] as Map<string, T>;
    };

    return {
        set: (key: string, value: T): void => {
            map().set(key, value);
        },
        getOrThrow: (key: string): T => {
            const value = map().get(key);
            if (value === undefined) {
                throw new AstromechError(`'${name}' has no entry for '${key}'.`);
            }
            return value;
        },
        get: (key: string): T | null => map().get(key) ?? null,
        has: (key: string): boolean => map().has(key),
        keys: (): string[] => [...map().keys()],
        clear: (): void => {
            map().clear();
        },
    };
}
