/** Public options for the assistant plugin, and the chat wire types. */

import type { AssistantModelMessage, ToolModelMessage, UserModelMessage } from 'ai';
import type { AiContextItem } from 'astromech';

/**
 * The package name, as a literal. `definePluginTable` needs the package as a
 * *type* to derive `plugin_assistant_*` table names, and a value inside the
 * definition cannot reach a module-scope table.
 */
export const ASSISTANT_PACKAGE = '@astromech/assistant';

export type AssistantOptions = {
    /** Reasoning effort for the loop. Defaults to `medium`. */
    effort?: 'low' | 'medium' | 'high';
    /**
     * Keep every mutating method off the tool surface. Defaults to `false`: a
     * mutating call is held for the user's decision in the drawer rather than
     * hidden from the assistant. Set it to `true` to drop them entirely.
     */
    readOnly?: boolean;
};

/** Options with every default applied — what the plugin's own code sees. */
export type ResolvedAssistantOptions = Required<AssistantOptions>;

/**
 * One turn of the conversation. Every part is kept and re-posted verbatim
 * whether or not the client understands it: tool-call ids are provider-minted,
 * and a reasoning part's `providerOptions` carry the signature the API rejects
 * the next request without.
 */
export type ChatMessage = UserModelMessage | AssistantModelMessage | ToolModelMessage;

/** The body posted to the chat route. */
export type ChatRequest = {
    messages: ChatMessage[];
    /** What the admin route the user is on declared, from `useAiContextItems()`. */
    aiContext?: AiContextItem[];
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
    toolCallId: string;
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
