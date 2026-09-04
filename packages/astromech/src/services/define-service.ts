/**
 * `defineService` — assemble a catalogue of methods into one service. The
 * record's type is derived from the hand-written interface, so a missing key, a
 * wrong input type and a wrong output type are all errors at the call.
 */

import type {
    AppContext,
    MethodContext,
    MethodsFor,
    ServiceDefinition,
} from '@/types/index';

/** A catalogue entry as this file walks it: any method, under any key. */
type AssembledMethod = {
    name: string;
    handler: (input: unknown, ctx: AppContext & MethodContext) => unknown;
};

/**
 * Assemble `methods` into the service named `name`. Each method is stamped with
 * its dotted id (`globals.get`) — the catalogue holds the objects passed in, so
 * no method has to state its own name.
 */
export function defineService<S extends object>(
    name: string,
    methods: MethodsFor<S>
): ServiceDefinition<S> {
    const catalogue = methods as unknown as Record<string, AssembledMethod>;
    for (const [key, method] of Object.entries(catalogue)) {
        method.name = `${name}.${key}`;
    }

    return {
        name,
        catalogue: methods as ServiceDefinition<S>['catalogue'],
        bind(ctx: AppContext): S {
            const bound: Record<string, (input: unknown) => unknown> = {};
            for (const [key, method] of Object.entries(catalogue)) {
                // `Object.create` rather than a spread, so the context's getters
                // stay unevaluated until the handler reads one.
                const withMethod = Object.create(ctx, {
                    method: { value: { name: method.name }, enumerable: true },
                }) as AppContext & MethodContext;
                bound[key] = (input) => method.handler(input, withMethod);
            }
            return bound as S;
        },
    };
}
