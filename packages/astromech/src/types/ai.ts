/**
 * Model access config — the optional `ai` block on `AstromechConfig`.
 */

import type { LanguageModel } from 'ai';

/**
 * A provider model instance — what `anthropic('claude-opus-5')` returns. A bare
 * gateway model id string is excluded because `wrapLanguageModel` needs an
 * instance, and core's middleware is not opt-out.
 */
export type ModelInstance = Exclude<LanguageModel, string>;

/** The models a site makes available. Absent unless configured. */
export type AiConfig = {
    /** The model used when a consumer asks for no name in particular. */
    model: ModelInstance;
    /** Named alternatives — a cheap model for bulk work, a vision model, … */
    models?: Record<string, ModelInstance>;
};
