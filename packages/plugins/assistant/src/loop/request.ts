/**
 * What one chat turn sends the model: the system prompt and the turns, with
 * the AI context placed where the API accepts it.
 */

import type { ChatMessage } from '../types';
import type { ModelMessage } from 'ai';
import type { AiContextItem } from 'astromech';
import { formatAiContextMessage } from 'astromech';

/**
 * The system prompt and turns to send. AI context goes after the final turn,
 * past the last cache breakpoint, so the system prompt stays the same from one
 * request to the next and the cached prefix holds.
 *
 * The context is a mid-conversation system message, and the API accepts one
 * only after a user message. A `user` turn is one. So is a `tool` turn, which
 * the Anthropic provider converts to a user message of tool results; that is
 * the last turn after an approval. With no turns, or with an assistant turn
 * last (a request that adds no new turn), the context rides in the system
 * prompt instead.
 */
export function buildRequest(
    messages: ChatMessage[],
    aiContext: AiContextItem[]
): { system: string; messages: ModelMessage[] } {
    const turns: ModelMessage[] = [...messages];
    const context = formatAiContextMessage(aiContext);
    if (context === null) return { system: SYSTEM_PROMPT, messages: turns };

    const lastRole = turns[turns.length - 1]?.role;
    if (lastRole !== 'user' && lastRole !== 'tool') {
        return { system: `${SYSTEM_PROMPT}\n\n${context.content}`, messages: turns };
    }

    turns.push(context);
    return { system: SYSTEM_PROMPT, messages: turns };
}

export const SYSTEM_PROMPT = `You are the assistant inside the Astromech admin.
You help the signed-in user find, understand and work on their site's content.
You can only see and do what their role permits: the tools you hold are the whole
of your reach, and a refused call means the user lacks that permission.
Say plainly when you cannot do something rather than guessing, and never invent
content you have not read.
Keep answers short and concrete.

Your tools are not loaded up front. Search for them with tool_search_tool_regex
before concluding that something cannot be done — an empty result means the tool
does not exist, not that you lack permission. Names are underscore-separated and
grouped by what they act on: entries_<type>_<method> for one entry type's
content (entries_page_query, entries_post_get), and users_, media_ and settings_
for the rest. A type's name, or a pattern like entries_.*_get, finds a group.`;
