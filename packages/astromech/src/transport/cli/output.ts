/** Shared CLI output helpers: uniform JSON mode, error reporting, JSON arg parsing and generated files. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { ValidationError } from '@/errors/validation';

/** Print a successful result. `--json` → pretty JSON to stdout; else run the text formatter. */
export function printResult(
    result: unknown,
    opts: { json: boolean; text: () => void }
): void {
    if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        opts.text();
    }
}

/** Report an error: JSON `{ error }` to stderr in --json mode, else `Error: ...`. Sets exit code 1. */
export function printError(err: unknown, opts: { json: boolean }): void {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
        console.error(JSON.stringify({ error: message }));
    } else {
        console.error(`Error: ${message}`);
    }
    process.exitCode = 1;
}

/** Parse a JSON CLI argument: inline JSON string, or `@path` to read JSON from a file. */
export async function parseJsonArg(value: string): Promise<unknown> {
    const raw = value.startsWith('@') ? await readFile(value.slice(1), 'utf-8') : value;
    try {
        return JSON.parse(raw);
    } catch (e) {
        throw new Error(
            `Invalid JSON${value.startsWith('@') ? ` in file ${value.slice(1)}` : ''}: ${
                e instanceof Error ? e.message : String(e)
            }`,
            { cause: e }
        );
    }
}

/**
 * The error to print for a failed call. The method's own input parse prints as
 * its issues; a field-pipeline or rule failure already lists each field's
 * messages in its own message, so it prints as it is.
 */
export function describeCallError(error: unknown): unknown {
    if (!(error instanceof ValidationError) || error.fields !== undefined) return error;
    return new Error(
        `Invalid arguments:\n${z.prettifyError(new z.ZodError(error.issues))}`
    );
}

/** Write a generated file at `out`, relative to the working directory, creating its folder. */
export async function writeGenerated(out: string, content: string): Promise<void> {
    const path = resolve(process.cwd(), out);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf-8');
}
