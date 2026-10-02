/**
 * What one chat turn sends the model: the system prompt and the turns, with
 * the AI context placed where the API accepts it.
 */

import type { ChatMessage } from '../types';
import type { ModelMessage } from 'ai';
import type { AiContextItem } from 'astromech';
import { formatAiContextMessage } from 'astromech';

/**
 * The system prompt and turns to send. The site's `instructions` follow the
 * fixed prompt, and AI context goes after the final turn, past the last cache
 * breakpoint, so the system prompt stays the same from one request to the next.
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
    aiContext: AiContextItem[],
    instructions: string
): { system: string; messages: ModelMessage[] } {
    const system = buildSystemPrompt(instructions);
    const turns: ModelMessage[] = [...messages];
    const context = formatAiContextMessage(aiContext);
    if (context === null) return { system, messages: turns };

    const lastRole = turns[turns.length - 1]?.role;
    if (lastRole !== 'user' && lastRole !== 'tool') {
        return { system: `${system}\n\n${context.content}`, messages: turns };
    }

    turns.push(context);
    return { system, messages: turns };
}

/** The fixed prompt, then the site's own instructions when it set any. */
function buildSystemPrompt(instructions: string): string {
    const trimmed = instructions.trim();
    if (trimmed === '') return SYSTEM_PROMPT;
    return `${SYSTEM_PROMPT}\n\nSite instructions:\n${trimmed}`;
}

/**
 * The fixed prompt, the same for every role and site so its cached prefix
 * holds. It shapes what the model does by default; the tools, `readOnly` and
 * the role's permissions are what limit it.
 */
export const SYSTEM_PROMPT = `You are the assistant inside the Astromech admin.
You help the signed-in user find, understand and work on their site's content.
You can only see and do what their role permits: the tools you hold are the whole
of your reach, and a refused call means the user lacks that permission.
Say plainly when you cannot do something rather than guessing, and never invent
content you have not read.
Keep answers short and concrete.

Stay on this site's work. A request is on topic when its result would end up in,
or act on, this site: copy for an entry, alt text for an image, advice on a
page's SEO, a translation of an entry, or how to use the admin. Writing meant for
somewhere else (a cover letter, homework, a poem for a friend, code for another
project) and general questions with no bearing on the site are off topic: decline
in a sentence and say what you can help with instead, which is the site's entries,
media, users, globals and notifications. When you cannot tell where the result
would go, ask which entry or page it is for rather than declining.

Your tools are not loaded up front. Search for them with tool_search_tool_regex
before concluding that something cannot be done — an empty result means the tool
does not exist, not that you lack permission. Names are underscore-separated and
grouped by what they act on: entries_<type>_<method> for one entry type's
content (entries_page_query, entries_post_get), and users_, media_, globals_ and
notifications_ for the rest. A type's name, or a pattern like entries_.*_get, finds a group.`;
