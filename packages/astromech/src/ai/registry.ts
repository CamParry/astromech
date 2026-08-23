/**
 * Model registry, globalThis-backed (see `@/registry.js`) so the models built
 * during boot are visible to the server at request time. Access is optional —
 * reads probe rather than throw; what's stored is already wrapped.
 */

import type { LanguageModelV4 } from '@ai-sdk/provider';
import { createRegistry } from '@/registry';

type AiModels = {
    model: LanguageModelV4;
    models: Record<string, LanguageModelV4>;
};

const ai = createRegistry<AiModels>('ai', { required: false });

export const setAiModels = ai.set;
export const getAiModels = ai.get;

export type { AiModels };
