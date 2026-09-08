/**
 * The plugin-facing `defineServiceMethod` — the generic one pinned to
 * `PluginContext`, so a plugin handler sees `ctx.plugin` with no annotation.
 * The `input` schema's two sides flow into the plugin's `AstromechPluginServices`.
 */

import type {
    PluginContext,
    ServiceMethod,
    ServiceMethodDefinition,
} from '@/types/index';
import type { z } from 'zod';
import { defineServiceMethod as defineServiceMethodGeneric } from '@/services/define-service-method';

export const defineServiceMethod: <S extends z.ZodType, Output>(
    method: ServiceMethodDefinition<S, Output, PluginContext>
) => ServiceMethod<z.input<S>, Output, PluginContext, z.output<S>> =
    defineServiceMethodGeneric;

export { noInput } from '@/services/define-service-method';
