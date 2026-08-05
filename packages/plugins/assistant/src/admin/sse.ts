/**
 * Server-sent-event framing for the chat stream. Pure string work, kept out of
 * `use-chat.ts` so it can be tested in the package's node-environment run.
 */

import type { ChatEvent } from '../types.js';

/**
 * Split a buffer into complete `\n\n`-delimited frames plus the remainder. A
 * network chunk can end anywhere, including mid-JSON, so the caller carries
 * `rest` into the next read.
 */
export function splitSseFrames(buffer: string): { frames: string[]; rest: string } {
    const parts = buffer.split('\n\n');
    const rest = parts.pop() ?? '';
    return { frames: parts, rest };
}

/** Read one frame's `data:` lines as a chat event, or null when it is not one. */
export function parseChatEvent(frame: string): ChatEvent | null {
    const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trim())
        .join('\n');
    if (data === '') return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(data);
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { type } = parsed as { type?: unknown };
    if (
        type === 'text-delta' ||
        type === 'message' ||
        type === 'approval-required' ||
        type === 'error' ||
        type === 'done'
    ) {
        return parsed as ChatEvent;
    }
    return null;
}
