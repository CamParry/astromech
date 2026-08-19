/**
 * SSE framing for the chat drawer. A network chunk can split a frame anywhere,
 * including mid-JSON, so the remainder has to survive between reads.
 */

import type { ChatEvent } from '../../src/types';
import { describe, expect, it } from 'vitest';
import { parseChatEvent, splitSseFrames } from '../../src/admin/sse';

/** Feed chunks through the buffer the way the reader loop does. */
function readChunks(chunks: string[]): ChatEvent[] {
    const events: ChatEvent[] = [];
    let buffer = '';
    for (const chunk of chunks) {
        buffer += chunk;
        const { frames, rest } = splitSseFrames(buffer);
        buffer = rest;
        for (const frame of frames) {
            const event = parseChatEvent(frame);
            if (event !== null) events.push(event);
        }
    }
    return events;
}

describe('splitSseFrames', () => {
    it('keeps an unterminated frame as the remainder', () => {
        expect(splitSseFrames('data: {"a":1}\n\ndata: {"b"')).toEqual({
            frames: ['data: {"a":1}'],
            rest: 'data: {"b"',
        });
    });

    it('returns no frames when nothing is terminated', () => {
        expect(splitSseFrames('data: {"a"')).toEqual({ frames: [], rest: 'data: {"a"' });
    });
});

describe('reading a chunked stream', () => {
    it('rejoins a frame split mid-JSON', () => {
        expect(readChunks(['data: {"type":"text-de', 'lta","text":"hi"}\n\n'])).toEqual([
            { type: 'text-delta', text: 'hi' },
        ]);
    });

    it('rejoins a frame split on its delimiter', () => {
        expect(
            readChunks([
                'data: {"type":"text-delta","text":"hi"}\n',
                '\ndata: {"type":"done"}\n\n',
            ])
        ).toEqual([{ type: 'text-delta', text: 'hi' }, { type: 'done' }]);
    });

    it('reads several frames arriving in one chunk', () => {
        const chunk =
            'data: {"type":"text-delta","text":"a"}\n\n' +
            'data: {"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"a"}]}}\n\n' +
            'data: {"type":"done"}\n\n';
        expect(readChunks([chunk])).toEqual([
            { type: 'text-delta', text: 'a' },
            {
                type: 'message',
                message: { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
            },
            { type: 'done' },
        ]);
    });

    it('carries a message event whose blocks it does not model', () => {
        const message = {
            role: 'assistant',
            content: [
                { type: 'thinking', thinking: '', signature: 'sig-1' },
                {
                    type: 'tool_use',
                    id: 'toolu_1',
                    name: 'entries_page_query',
                    input: {},
                },
            ],
        };

        expect(
            readChunks([`data: ${JSON.stringify({ type: 'message', message })}\n\n`])
        ).toEqual([{ type: 'message', message }]);
    });

    it('reads the calls an approval-required frame holds', () => {
        const requests = [
            {
                approvalId: 'ap_1',
                toolCallId: 'toolu_1',
                method: 'entries.page.update',
                toolName: 'entries_page_update',
                message: 'Update the page "Home"?',
                destructive: false,
                arguments: { id: 'page_1' },
            },
        ];

        expect(
            readChunks([
                `data: ${JSON.stringify({ type: 'approval-required', requests })}\n\n`,
            ])
        ).toEqual([{ type: 'approval-required', requests }]);
    });

    it('drops a frame that is not a chat event', () => {
        expect(
            readChunks([': keep-alive\n\ndata: nonsense\n\ndata: {"type":"nope"}\n\n'])
        ).toEqual([]);
    });
});
