/**
 * `typedServices`: the one place the wide `entries` and `globals` services are
 * given their typed facades. Imports types only, so the browser client uses it.
 */

import type {
    EntriesService,
    GlobalsService,
    TypedEntriesService,
    TypedGlobalsService,
} from '@/types/index';

/** A handle whose `entries` and `globals` take the typed facades. */
type WithTypedFacades<S> = Omit<S, 'entries' | 'globals'> & {
    entries: TypedEntriesService;
    globals: TypedGlobalsService;
};

/**
 * `services` with `entries` and `globals` under their typed facades. The same
 * object: a facade only adds overloads that narrow a result by a literal `type`
 * or `key`, and the overloads cannot be derived from the wide interface, hence
 * the cast.
 */
export function typedServices<
    S extends { entries: EntriesService; globals: GlobalsService },
>(services: S): WithTypedFacades<S> {
    return services as unknown as WithTypedFacades<S>;
}
