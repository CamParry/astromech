/**
 * Registry — the one mechanism behind every boot-wired driver slot.
 *
 * Backed by `globalThis`, never a module-level singleton: the package ships two
 * separate tsup builds, and six `exports` subpaths can resolve to either `src`
 * or `dist`, so one module can be instantiated more than once in a process. The
 * global is the only slot every copy shares. The application slot in
 * `src/boot/application.ts` depends on that: two copies of it would boot the
 * runtime twice.
 *
 * Each domain declares its own slot rather than sharing one central context
 * object: a context holding every driver would have to import every domain's
 * types, turning this leaf into a hub. The registry stays type-agnostic.
 */

/**
 * The shared namespace. Registry slots take arbitrary string keys; the named
 * keys are process guards, read directly rather than through a registry object.
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
    /** Throws when unset. */
    get(): T;
    /** Null when unset — for callers that legitimately probe. */
    peek(): T | null;
    /** Return the slot to its unset state. */
    clear(): void;
};

export type OptionalRegistry<T> = {
    set(value: T): void;
    peek(): T | null;
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
        get: (): T => {
            const value = globals()[name];
            if (value === undefined) {
                const hint = opts?.hint === undefined ? '' : ` ${opts.hint}`;
                throw new Error(`[Astromech] '${name}' is not configured.${hint}`);
            }
            return value as T;
        },
        peek: (): T | null => (globals()[name] ?? null) as T | null,
        clear: (): void => {
            // Assign rather than `delete` — `peek()` reads `?? null`, so an
            // undefined slot is already indistinguishable from an absent one.
            globals()[name] = undefined;
        },
    };
}

export type KeyedRegistry<T> = {
    set(key: string, value: T): void;
    /** Throws when the key is unset. */
    get(key: string): T;
    /** Null when unset — for callers that legitimately probe. */
    peek(key: string): T | null;
    has(key: string): boolean;
    keys(): string[];
    /** Drop every entry, leaving the slot usable. */
    clear(): void;
};

/**
 * Many values under one slot name, backed by a `Map` — the same mechanism as
 * `createRegistry`, keyed. Stays type-agnostic for the same reason.
 */
export function createKeyedRegistry<T>(name: string): KeyedRegistry<T> {
    const slot = (): Map<string, T> => {
        const namespace = globals();
        namespace[name] ??= new Map<string, T>();
        return namespace[name] as Map<string, T>;
    };

    return {
        set: (key: string, value: T): void => {
            slot().set(key, value);
        },
        get: (key: string): T => {
            const value = slot().get(key);
            if (value === undefined) {
                throw new Error(`[Astromech] '${name}' has no entry for '${key}'.`);
            }
            return value;
        },
        peek: (key: string): T | null => slot().get(key) ?? null,
        has: (key: string): boolean => slot().has(key),
        keys: (): string[] => [...slot().keys()],
        clear: (): void => {
            slot().clear();
        },
    };
}
