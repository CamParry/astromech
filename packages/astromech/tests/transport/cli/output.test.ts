import { describe, it, expect, vi, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { parseJsonArg, printResult, printError } from '@/transport/cli/output';

afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
});

describe('parseJsonArg', () => {
    it('parses an inline JSON object string', async () => {
        const result = await parseJsonArg('{"key":"value"}');
        expect(result).toEqual({ key: 'value' });
    });

    it('parses an inline JSON array', async () => {
        const result = await parseJsonArg('[1,2,3]');
        expect(result).toEqual([1, 2, 3]);
    });

    it('rejects invalid JSON with an error containing "Invalid JSON"', async () => {
        await expect(parseJsonArg('not json')).rejects.toThrow('Invalid JSON');
    });

    it('reads and parses JSON from a @file path', async () => {
        const tmpPath = join(tmpdir(), `astromech-test-${Date.now()}.json`);
        const payload = { hello: 'world' };
        await writeFile(tmpPath, JSON.stringify(payload), 'utf-8');
        try {
            const result = await parseJsonArg(`@${tmpPath}`);
            expect(result).toEqual(payload);
        } finally {
            await unlink(tmpPath);
        }
    });

    it('includes the file path in the error message for invalid @file JSON', async () => {
        const tmpPath = join(tmpdir(), `astromech-test-invalid-${Date.now()}.json`);
        await writeFile(tmpPath, 'not json', 'utf-8');
        try {
            await expect(parseJsonArg(`@${tmpPath}`)).rejects.toThrow(
                `Invalid JSON in file ${tmpPath}`
            );
        } finally {
            await unlink(tmpPath);
        }
    });
});

describe('printResult', () => {
    it('json:true calls console.log with valid JSON matching the input', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const data = { id: '1', status: 'draft' };
        printResult(data, { json: true, text: () => undefined });
        expect(spy).toHaveBeenCalledOnce();
        const rawArg = spy.mock.calls[0]?.[0];
        expect(typeof rawArg).toBe('string');
        const printed = JSON.parse(rawArg as string) as unknown;
        expect(printed).toEqual(data);
    });

    it('json:false invokes the text callback and does NOT print JSON', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        let textCalled = false;
        printResult(
            { id: '1' },
            {
                json: false,
                text: () => {
                    textCalled = true;
                },
            }
        );
        expect(textCalled).toBe(true);
        // Ensure console.log was not called by printResult itself (text callback may call it,
        // but printResult should not call it independently in non-json mode).
        // Since text callback does NOT call console.log here, logSpy should not have been called.
        expect(logSpy).not.toHaveBeenCalled();
    });
});

describe('printError', () => {
    it('json:true writes JSON error to stderr and sets exitCode to 1', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        printError(new Error('something failed'), { json: true });
        expect(spy).toHaveBeenCalledOnce();
        const rawArg = spy.mock.calls[0]?.[0];
        expect(typeof rawArg).toBe('string');
        const printed = JSON.parse(rawArg as string) as { error: string };
        expect(printed).toEqual({ error: 'something failed' });
        expect(process.exitCode).toBe(1);
    });

    it('json:false writes "Error: ..." to stderr and sets exitCode to 1', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        printError(new Error('bad input'), { json: false });
        expect(spy).toHaveBeenCalledOnce();
        const rawArg = spy.mock.calls[0]?.[0];
        expect(rawArg).toBe('Error: bad input');
        expect(process.exitCode).toBe(1);
    });

    it('handles non-Error thrown values', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        printError('plain string error', { json: false });
        const rawArg = spy.mock.calls[0]?.[0];
        expect(rawArg).toBe('Error: plain string error');
    });
});
