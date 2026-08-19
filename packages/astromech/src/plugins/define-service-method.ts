import type { ServiceMethod } from '@/types/index';
import * as zod from 'zod';

/**
 * Define a typed service method (a plugin's contribution to the unified services
 * layer). The Input/Output generics flow into the plugin's self-augmentation of
 * `AstromechPluginServices` so callers see real signatures. The returned
 * `ServiceMethod` carries its manifest metadata (`summary`, `input`, …) too.
 */
export function defineServiceMethod<Input = unknown, Output = unknown>(
    method: ServiceMethod<Input, Output>
): ServiceMethod<Input, Output> {
    return method;
}

/**
 * The `input` schema for a service method that takes no arguments.
 *
 * A no-argument method still has to declare an input, because a tool with no
 * `inputSchema` cannot be published at all — MCP requires an object schema, and
 * a method that declares nothing is skipped rather than given a synthesised one.
 *
 * `z.object({})` alone would not typecheck against `defineServiceMethod<undefined,
 * …>`; the transform is what reconciles the two, and it renders as
 * `{type: 'object', properties: {}}` — "send me an empty object" — which is
 * precisely the truth.
 */
export function noInput(): zod.ZodType<undefined> {
    return zod.object({}).transform(() => undefined);
}
