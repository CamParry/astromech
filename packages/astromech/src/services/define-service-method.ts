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
 *
 * With an `output` schema the two result types are read off it the same way:
 * the handler returns its `z.input`, and a caller gets its `z.output`.
 */
export function defineServiceMethod<
    S extends zod.ZodType,
    O extends zod.ZodType,
    Ctx = AppContext,
>(
    method: ServiceMethodDefinition<S, zod.output<O>, Ctx, zod.input<O>> & { output: O }
): ServiceMethod<zod.input<S>, zod.output<O>, Ctx, zod.output<S>, zod.input<O>> & {
    output: O;
};
export function defineServiceMethod<S extends zod.ZodType, Output, Ctx = AppContext>(
    method: ServiceMethodDefinition<S, Output, Ctx> & { output?: undefined }
): ServiceMethod<zod.input<S>, Output, Ctx, zod.output<S>>;
export function defineServiceMethod(method: object): object {
    // `S` and `z.ZodType<z.output<S>, z.input<S>>` describe the same schema,
    // which TS cannot see while `S` is unresolved. The overloads name both
    // sides of each schema, which is what lets a reader of the method
    // (`MethodsFor`, `ServiceInterface`) read the call and result types off it.
    return method;
}

/**
 * The `input` schema for a service method that takes no arguments. MCP
 * requires an object schema, so the transform reconciles the two: the handler
 * receives `undefined` rather than the empty object.
 */
export function noInput(): zod.ZodType<undefined> {
    return zod.object({}).transform(() => undefined);
}
