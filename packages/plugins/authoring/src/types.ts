/** Public options for the authoring plugin, and the chat wire types. */

import type { AIContextEntry } from 'astromech/methods';

/**
 * Models the assistant may run on. Restricted rather than a free string:
 * `role: 'system'` inside `messages[]` — how AI context reaches the model —
 * is silently dropped to a top-level `system` block on models that do not
 * support it, which would swap a hard failure for a quiet wrong answer.
 */
export type AuthoringModel =
    | 'claude-opus-5'
    | 'claude-opus-4-8'
    | 'claude-fable-5'
    | 'claude-mythos-5';

export type AuthoringOptions = {
    /** Defaults to `claude-opus-5`. */
    model?: AuthoringModel;
    /** Env var holding the API key, read server-side per request. Defaults to `ANTHROPIC_API_KEY`. */
    apiKeyEnv?: string;
    /** Reasoning effort for the loop. Defaults to `medium`. */
    effort?: 'low' | 'medium' | 'high';
    /**
     * Restrict the assistant to methods that do not mutate. Defaults to `true`:
     * writes wait for the confirm UI, which does not exist yet.
     */
    readOnly?: boolean;
};

/** Options with every default applied — what the plugin's own code sees. */
export type ResolvedAuthoringOptions = Required<AuthoringOptions>;

/** One turn of the conversation as the browser sends it. */
export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** The body posted to the chat route. */
export type ChatRequest = {
    messages: ChatMessage[];
    /** What the admin route the user is on declared, from `useAIContextEntries()`. */
    aiContext?: AIContextEntry[];
};

/** One server-sent event from the chat route. */
export type ChatEvent =
    | { type: 'text'; text: string }
    | { type: 'tool'; name: string }
    | { type: 'error'; message: string }
    | { type: 'done' };
