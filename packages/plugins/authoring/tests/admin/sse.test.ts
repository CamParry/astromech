/**
 * SSE framing for the chat drawer. A network chunk can split a frame anywhere,
 * including mid-JSON, so the remainder has to survive between reads.
 */

import { describe, expect, it } from 'vitest';
import { parseChatEvent, splitSseFrames } from '../../src/admin/sse.js';
import type { ChatEvent } from '../../src/types.js';

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
        expect(readChunks(['data: {"type":"te', 'xt","text":"hi"}\n\n'])).toEqual([
            { type: 'text', text: 'hi' },
        ]);
    });

    it('rejoins a frame split on its delimiter', () => {
        expect(
            readChunks([
                'data: {"type":"text","text":"hi"}\n',
                '\ndata: {"type":"done"}\n\n',
            ])
        ).toEqual([{ type: 'text', text: 'hi' }, { type: 'done' }]);
    });

    it('reads several frames arriving in one chunk', () => {
        const chunk =
            'data: {"type":"text","text":"a"}\n\n' +
            'data: {"type":"tool","name":"entriesQuery"}\n\n' +
            'data: {"type":"done"}\n\n';
        expect(readChunks([chunk])).toEqual([
            { type: 'text', text: 'a' },
            { type: 'tool', name: 'entriesQuery' },
            { type: 'done' },
        ]);
    });

    it('drops a frame that is not a chat event', () => {
        expect(
            readChunks([': keep-alive\n\ndata: nonsense\n\ndata: {"type":"nope"}\n\n'])
        ).toEqual([]);
    });
});
