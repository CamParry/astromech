/**
 * The bound form of a service definition: the interface, with every call made
 * against the context of the request it is made in.
 */

import type { ServiceDefinition } from '@/types/index';
import { currentAppContext } from '@/app-context/app-context';

/** The interface, each call bound to `currentAppContext()`. */
export function bindCurrent<S extends object>(definition: ServiceDefinition<S>): S {
    const bound: Record<string, (input: unknown) => Promise<unknown>> = {};
    for (const key of Object.keys(definition.catalogue)) {
        bound[key] = async (input) => {
            const service = definition.bind(await currentAppContext()) as Record<
                string,
                (input: unknown) => unknown
            >;
            return service[key]?.(input);
        };
    }
    return bound as S;
}
