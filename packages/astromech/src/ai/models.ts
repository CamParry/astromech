/**
 * The `ai` capability: build the configured models at boot, read them at
 * request time. `ai` is imported dynamically so a site that configures no
 * model never pulls the package into its module graph.
 */

import type { AiModels } from '@/ai/registry';
import type { AiConfig } from '@/types/index';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { logging } from '@/ai/middleware';
import { getAiModels } from '@/ai/registry';

/** Wrap the configured models with core's middleware, keyed by name. */
export async function buildAiModels(config: AiConfig): Promise<AiModels> {
    const { wrapLanguageModel } = await import('ai');
    const model = wrapLanguageModel({
        model: config.model,
        middleware: logging('default'),
    });
    const models: Record<string, LanguageModelV4> = {};
    for (const [name, instance] of Object.entries(config.models ?? {})) {
        models[name] = wrapLanguageModel({
            model: instance,
            middleware: logging(name),
        });
    }
    return { model, models };
}

/**
 * The configured model, or the one registered under `name`. A name that is not
 * configured falls back to the default model.
 */
export function getModel(name?: string): LanguageModelV4 | undefined {
    const registered = getAiModels();
    if (registered === null) return undefined;
    if (name === undefined) return registered.model;
    return registered.models[name] ?? registered.model;
}

/** Whether a model is available, without needing the instance. */
export function hasModel(name?: string): boolean {
    return getModel(name) !== undefined;
}
