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
    ServiceMethodContract,
} from '@/types/index';
import { parseMethodInput } from '@/services/parse-method-input';

/** A catalogue entry as this file walks it: any method, under any key. */
type AssembledMethod = {
    name: string;
    input: ServiceMethodContract['input'];
    requires?: string;
    handler: (input: unknown, ctx: AppContext & MethodContext) => unknown;
};

/** How a service checks the capability a method `requires` of the call's target. */
type DefineServiceOptions = {
    /**
     * Throw when the target `input` names does not declare `capability`. Called
     * before the input is parsed, so a target that does not resolve is left for
     * the handler to refuse.
     */
    assertRequires?: (capability: string, input: unknown, ctx: AppContext) => void;
};

/**
 * Assemble `methods` into the service named `name`. Each method is stamped with
 * its dotted id (`globals.get`) — the catalogue holds the objects passed in, so
 * no method has to state its own name.
 */
export function defineService<S extends object>(
    name: string,
    methods: MethodsFor<S>,
    options: DefineServiceOptions = {}
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
                bound[key] = (input) => {
                    if (method.requires !== undefined) {
                        options.assertRequires?.(method.requires, input, ctx);
                    }
                    return method.handler(parseMethodInput(method, input), withMethod);
                };
            }
            return bound as S;
        },
    };
}
