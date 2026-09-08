/**
 * `defineServiceMethod` — the identity function that gives a method object its
 * contextual typing, and `noInput`, the schema for a method taking no argument.
 */

import type { AppContext, ServiceMethod, ServiceMethodDefinition } from '@/types/index';
import * as zod from 'zod';

/**
 * Define a typed service method. Both input types are read off the `input`
 * schema, so the handler's parameter needs no annotation: it receives the
 * parsed shape (`z.output`), while what a CALLER passes (`z.input`) is what
 * flows into the service interface the method is assembled under.
 */
export function defineServiceMethod<S extends zod.ZodType, Output, Ctx = AppContext>(
    method: ServiceMethodDefinition<S, Output, Ctx>
): ServiceMethod<zod.input<S>, Output, Ctx, zod.output<S>> {
    // `S` and `z.ZodType<z.output<S>, z.input<S>>` describe the same schema,
    // which TS cannot see while `S` is unresolved. Naming both sides is what
    // lets a reader of the method (`MethodsFor`, `ServiceInterface`) read the
    // call type off it.
    return method as ServiceMethod<zod.input<S>, Output, Ctx, zod.output<S>>;
}

/**
 * The `input` schema for a service method that takes no arguments. MCP
 * requires an object schema, so the transform reconciles the two: the handler
 * receives `undefined` rather than the empty object.
 */
export function noInput(): zod.ZodType<undefined> {
    return zod.object({}).transform(() => undefined);
}
