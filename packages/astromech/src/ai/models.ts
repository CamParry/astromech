/**
 * Boot-time assembly of the `ai` capability: every configured model wrapped
 * with core's middleware. `ai` is imported dynamically so a site that
 * configures no model never pulls the package into its module graph.
 */

import type { AiModels } from '@/ai/registry';
import type { AiConfig } from '@/types/index';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { logging } from '@/ai/middleware';

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
