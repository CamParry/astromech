/**
 * Model registry.
 *
 * globalThis-backed (see `@/utilities/registry.js`) so the models built during
 * boot are visible to the server at request time. Model access is optional —
 * reads probe rather than throw. What is stored is already wrapped.
 */

import { createRegistry } from '@/utilities/registry';
import type { LanguageModelV4 } from '@ai-sdk/provider';

type WrappedAIConfig = {
    model: LanguageModelV4;
    models: Record<string, LanguageModelV4>;
};

const ai = createRegistry<WrappedAIConfig>('ai', { required: false });

export const setAIConfig = ai.set;
export const getAIConfig = ai.peek;

export type { WrappedAIConfig };
