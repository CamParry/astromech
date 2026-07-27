import { describe, expect, it } from 'vitest';
import { toToolResultText } from '@/transport/mcp/server.js';

describe('toToolResultText', () => {
    it('serializes objects to pretty JSON', () => {
        expect(JSON.parse(toToolResultText({ a: 1 }))).toEqual({ a: 1 });
    });

    it('coerces undefined (void returns like delete) to the string "null"', () => {
        // Regression: JSON.stringify(undefined) is undefined, which the MCP
        // CallToolResult schema rejects (text must be a string).
        expect(toToolResultText(undefined)).toBe('null');
    });

    it('serializes null to the string "null"', () => {
        expect(toToolResultText(null)).toBe('null');
    });

    it('always returns a string', () => {
        for (const v of [undefined, null, 0, '', false, [], {}]) {
            expect(typeof toToolResultText(v)).toBe('string');
        }
    });
});
