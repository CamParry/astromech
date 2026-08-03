/**
 * What one chat turn sends the model: the system prompt and the turns, with
 * the AI context placed where the API accepts it.
 */

import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta';
import { formatAIContextMessage } from 'astromech';
import type { AIContextEntry } from 'astromech';
import type { ChatMessage } from '../types.js';

/**
 * The system prompt and turns to send. AI context goes immediately before the
 * final user turn, which keeps it after the last cache breakpoint so navigating
 * does not invalidate the cached prefix. A system message may not be
 * `messages[0]`, so on the opening turn it rides in the system prompt instead —
 * there is no cached prefix yet for it to cost anything.
 */
export function buildRequest(
    messages: ChatMessage[],
    aiContext: AIContextEntry[]
): { system: string; messages: BetaMessageParam[] } {
    const turns: BetaMessageParam[] = messages.map((message) => ({
        role: message.role,
        content: message.content,
    }));
    const context = formatAIContextMessage(aiContext);
    if (context === null) return { system: SYSTEM_PROMPT, messages: turns };

    const last = turns.length - 1;
    if (last < 1 || turns[last]?.role !== 'user') {
        return { system: `${SYSTEM_PROMPT}\n\n${context.content}`, messages: turns };
    }

    turns.splice(last, 0, context);
    return { system: SYSTEM_PROMPT, messages: turns };
}

export const SYSTEM_PROMPT = `You are the authoring assistant inside the Astromech admin.
You help the signed-in user find, understand and work on their site's content.
You can only see and do what their role permits: the tools you hold are the whole
of your reach, and a refused call means the user lacks that permission.
Say plainly when you cannot do something rather than guessing, and never invent
content you have not read.
Keep answers short and concrete.`;
