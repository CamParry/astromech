/**
 * Registry — the one mechanism behind every boot-wired driver slot.
 *
 * Backed by `globalThis`, never a module-level singleton: tsup emits several
 * entry chunks, so a module-scoped variable is duplicated once per chunk and a
 * value written through one copy is invisible through the others. The global is
 * the only slot every chunk shares. The lazy boot memo in `src/middleware.ts`
 * depends on that: two copies of it would boot the runtime twice.
 *
 * Each domain declares its own slot rather than sharing one central context
 * object: a context holding every driver would have to import every domain's
 * types, turning this leaf into a hub. The registry stays type-agnostic.
 */

declare global {
    var __astromech: Record<string, unknown> | undefined;
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
    const slots = (): Record<string, unknown> => (globalThis.__astromech ??= {});

    return {
        set: (value: T): void => {
            slots()[name] = value;
        },
        get: (): T => {
            const value = slots()[name];
            if (value === undefined) {
                const hint = opts?.hint === undefined ? '' : ` ${opts.hint}`;
                throw new Error(`[Astromech] '${name}' is not configured.${hint}`);
            }
            return value as T;
        },
        peek: (): T | null => (slots()[name] ?? null) as T | null,
        clear: (): void => {
            // Assign rather than `delete` — `peek()` reads `?? null`, so an
            // undefined slot is already indistinguishable from an absent one.
            slots()[name] = undefined;
        },
    };
}
