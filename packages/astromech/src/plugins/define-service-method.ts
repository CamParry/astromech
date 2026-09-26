/**
 * The plugin-facing `defineServiceMethod` — the generic one pinned to
 * `PluginContext`, so a plugin handler sees `ctx.plugin` with no annotation.
 * The `input` and `output` schemas' sides flow into the plugin's
 * `AstromechPluginServices`.
 */

import type {
    PluginContext,
    ServiceMethod,
    ServiceMethodDefinition,
} from '@/types/index';
import type { z } from 'zod';
import { defineServiceMethod as defineServiceMethodGeneric } from '@/services/define-service-method';

export const defineServiceMethod: {
    <S extends z.ZodType, O extends z.ZodType>(
        method: ServiceMethodDefinition<S, z.output<O>, PluginContext, z.input<O>> & {
            output: O;
        }
    ): ServiceMethod<z.input<S>, z.output<O>, PluginContext, z.output<S>, z.input<O>> & {
        output: O;
    };
    <S extends z.ZodType, Output>(
        method: ServiceMethodDefinition<S, Output, PluginContext> & { output?: undefined }
    ): ServiceMethod<z.input<S>, Output, PluginContext, z.output<S>>;
} = defineServiceMethodGeneric;
