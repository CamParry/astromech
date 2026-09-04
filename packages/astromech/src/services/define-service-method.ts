/**
 * `defineServiceMethod` — the identity function that gives a method object its
 * contextual typing, and `noInput`, the schema for a method taking no argument.
 */

import type { AppContext, ServiceMethod } from '@/types/index';
import * as zod from 'zod';

/**
 * Define a typed service method. Input/Output generics flow into the service
 * interface the method is assembled under, so callers see real signatures.
 */
export function defineServiceMethod<Input = unknown, Output = unknown, Ctx = AppContext>(
    method: ServiceMethod<Input, Output, Ctx>
): ServiceMethod<Input, Output, Ctx> {
    return method;
}

/**
 * The `input` schema for a service method that takes no arguments. MCP
 * requires an object schema, so a bare `z.object({})` won't typecheck against
 * `defineServiceMethod<undefined, ...>` — the transform reconciles the two.
 */
export function noInput(): zod.ZodType<undefined> {
    return zod.object({}).transform(() => undefined);
}
