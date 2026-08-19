/**
 * Model registry.
 *
 * globalThis-backed (see `@/utilities/registry.js`) so the models built during
 * boot are visible to the server at request time. Model access is optional —
 * reads probe rather than throw. What is stored is already wrapped.
 */

import type { LanguageModelV4 } from '@ai-sdk/provider';
import { createRegistry } from '@/utilities/registry';

type WrappedAiConfig = {
    model: LanguageModelV4;
    models: Record<string, LanguageModelV4>;
};

const ai = createRegistry<WrappedAiConfig>('ai', { required: false });

export const setAiConfig = ai.set;
export const getAiConfig = ai.get;

export type { WrappedAiConfig };
