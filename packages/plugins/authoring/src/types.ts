/** Public options for the authoring plugin, and the chat wire types. */

import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta';
import type { AIContextItem } from 'astromech';

/**
 * The package name, as a literal. `definePluginTable` needs the package as a
 * *type* to derive `plugin_authoring_*` table names, and a value inside the
 * definition cannot reach a module-scope descriptor.
 */
export const AUTHORING_PACKAGE = '@astromech/authoring';

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
     * Restrict the assistant to methods that do not mutate. Defaults to `true`
     * while the drawer has no way to answer an approval; set to `false`, a
     * mutating call is held for the user's decision rather than kept off the
     * tool surface.
     */
    readOnly?: boolean;
};

/** Options with every default applied — what the plugin's own code sees. */
export type ResolvedAuthoringOptions = Required<AuthoringOptions>;

/**
 * One turn of the conversation, as Anthropic content blocks. Every block is
 * kept and re-posted verbatim whether or not the client understands it:
 * `tool_use` ids are server-minted, and `thinking` blocks are rejected by the
 * API unless they come back unmodified and in the order they were generated.
 */
export type ChatMessage = {
    role: 'user' | 'assistant';
    content: BetaContentBlockParam[];
};

/** The body posted to the chat route. */
export type ChatRequest = {
    messages: ChatMessage[];
    /** What the admin route the user is on declared, from `useAIContextItems()`. */
    aiContext?: AIContextItem[];
    /** Answers to the approvals the previous response paused on. */
    decisions?: ApprovalDecision[];
};

/**
 * One call held back for a human decision.
 *
 * Distinct from core's `ConfirmRequest`, which belongs to the stateless
 * dispatch-level brake in `policies/confirmation.ts`: that one carries the
 * arguments a caller may re-post, this one names a server-held row that the
 * arguments are read back from.
 */
export type ApprovalRequest = {
    approvalId: string;
    toolUseId: string;
    method: string;
    toolName: string;
    message: string;
    destructive: boolean;
    arguments: Record<string, unknown>;
};

/** One answer to an `ApprovalRequest`, posted on the next turn. */
export type ApprovalDecision = { approvalId: string; action: 'approve' | 'reject' };

/**
 * One server-sent event from the chat route. `text-delta` renders the in-flight
 * tail and nothing more; `message` is the authoritative record of a finished
 * turn and the only event that feeds the next request.
 */
export type ChatEvent =
    | { type: 'text-delta'; text: string }
    | { type: 'message'; message: ChatMessage }
    | { type: 'approval-required'; requests: ApprovalRequest[] }
    | { type: 'error'; error: string }
    | { type: 'done' };
