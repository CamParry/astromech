import type { ServiceMethod } from '@/types/index';
import * as zod from 'zod';

/**
 * Define a typed service method — a plugin's contribution to the unified
 * services layer. Input/Output generics flow into the plugin's
 * self-augmentation of `AstromechPluginServices` so callers see real signatures.
 */
export function defineServiceMethod<Input = unknown, Output = unknown>(
    method: ServiceMethod<Input, Output>
): ServiceMethod<Input, Output> {
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
