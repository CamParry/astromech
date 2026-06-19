/** Shared CLI output helpers: uniform JSON mode + error reporting + JSON arg parsing. */
import { readFile } from 'node:fs/promises';

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
