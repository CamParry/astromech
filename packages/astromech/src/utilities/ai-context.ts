/**
 * Renders the AI context references an admin route declared into the
 * `role: 'system'` message a chat request carries inside `messages[]`.
 */

import type { AIContextReference } from '@/types/ai-context.js';

/** A declared reference with its position: lower `depth` is less specific. */
export type AIContextEntry = {
    reference: AIContextReference;
    depth: number;
    order: number;
};

/**
 * Build the context message from the current references, ordered least to most
 * specific. Returns `null` when there is nothing to say, so the caller omits
 * the message rather than sending an empty one.
 */
export function formatAIContextMessage(
    entries: readonly AIContextEntry[]
): { role: 'system'; content: string } | null {
    if (entries.length === 0) return null;
    const sorted = [...entries].sort((a, b) => a.depth - b.depth || a.order - b.order);
    const lines = sorted.map(
        (entry, index) => `${index + 1}. ${describeReference(entry.reference)}`
    );
    return {
        role: 'system',
        content: `The user is currently viewing, from least to most specific:\n${lines.join('\n')}`,
    };
}

/** Render one reference as a single line. */
function describeReference(reference: AIContextReference): string {
    const { kind, type, id, label } = reference;
    switch (kind) {
        case 'entries':
            if (type === undefined) break;
            return id === undefined
                ? `Entry list for type \`${type}\` (\`${label}\`)`
                : `Entry \`${label}\` (type \`${type}\`, id \`${id}\`)`;
        case 'media':
            return id === undefined
                ? `Media library (\`${label}\`)`
                : `Media item \`${label}\` (id \`${id}\`)`;
        case 'users':
            return id === undefined
                ? `User list (\`${label}\`)`
                : `User \`${label}\` (id \`${id}\`)`;
        case 'settings':
            return withId(`Settings screen \`${label}\``, id);
        case 'pages':
            return withId(`Admin page \`${label}\``, id);
        default:
            break;
    }
    return `${kind} \`${label}\``;
}

/** Append an id suffix to a line when the reference carries one. */
function withId(line: string, id: string | undefined): string {
    return id === undefined ? line : `${line} (id \`${id}\`)`;
}
