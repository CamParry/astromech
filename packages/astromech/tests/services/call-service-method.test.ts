/**
 * `callServiceMethod` calls a method by name with the service as its receiver,
 * and throws the caller's message when the service has no such method.
 */

import { describe, expect, it } from 'vitest';
import { callServiceMethod } from '@/services/call-service-method';

describe('callServiceMethod', () => {
    it('calls the method with the service as the receiver', async () => {
        const service = {
            prefix: 'hello ',
            greet(this: { prefix: string }, input: unknown) {
                return this.prefix + String(input);
            },
        };
        await expect(
            callServiceMethod(service, 'greet', 'world', 'absent')
        ).resolves.toBe('hello world');
    });

    it('throws the given message for a missing or non-function member', async () => {
        await expect(
            callServiceMethod({ count: 1 }, 'count', {}, 'no count')
        ).rejects.toThrow('no count');
        await expect(
            callServiceMethod(undefined, 'get', {}, 'no service')
        ).rejects.toThrow('no service');
    });
});
