/**
 * The plugin-facing `defineServiceMethod` — the generic one pinned to
 * `PluginContext`, so a plugin handler sees `ctx.plugin` with no annotation.
 * Input/Output generics flow into the plugin's `AstromechPluginServices`.
 */

import type { PluginContext, ServiceMethod } from '@/types/index';
import { defineServiceMethod as defineServiceMethodGeneric } from '@/services/define-service-method';

export const defineServiceMethod: <Input = unknown, Output = unknown>(
    method: ServiceMethod<Input, Output, PluginContext>
) => ServiceMethod<Input, Output, PluginContext> = defineServiceMethodGeneric;

export { noInput } from '@/services/define-service-method';
