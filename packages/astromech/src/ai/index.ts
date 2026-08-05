/**
 * Model access — the whole public surface of the `ai` capability.
 *
 * Nothing configured means `undefined`, and consumers branch on that to disable
 * their feature rather than throwing. The model handed back is already wrapped
 * with core's middleware, so a consumer cannot opt out of it.
 */

import type { LanguageModelV4 } from '@ai-sdk/provider';
import { getAIConfig } from '@/ai/registry.js';

/**
 * The configured model, or the one registered under `name`. A name that is not
 * configured falls back to the default model.
 */
export function getModel(name?: string): LanguageModelV4 | undefined {
    const config = getAIConfig();
    if (config === null) return undefined;
    if (name === undefined) return config.model;
    return config.models[name] ?? config.model;
}

/** Whether a model is available, without needing the instance. */
export function hasModel(name?: string): boolean {
    return getModel(name) !== undefined;
}
