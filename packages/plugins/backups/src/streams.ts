/**
 * Running a stored or dumped database through gzip on its way to storage or
 * to the restore driver, with every stream's failure reaching the caller.
 */

import type { Transform } from 'node:stream';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Pass `source` through `transform` and hand the output to `consume`. Settles
 * once both the copy and `consume` have, and rejects with whichever fails
 * first. A failure on either side destroys `transform`, which ends the copy,
 * so no stream is left to fail with nothing listening.
 */
export async function pipelineTo<T>(
    source: ReadableStream<Uint8Array>,
    transform: Transform,
    consume: (output: ReadableStream<Uint8Array>) => Promise<T>
): Promise<T> {
    const copy = pipeline(
        Readable.fromWeb(source as Parameters<typeof Readable.fromWeb>[0]),
        transform
    );
    const output = Readable.toWeb(transform) as ReadableStream<Uint8Array>;
    try {
        const [, result] = await Promise.all([
            copy,
            // Inside a promise, so a `consume` that throws rejects here too.
            Promise.resolve().then(() => consume(output)),
        ]);
        return result;
    } catch (error) {
        transform.destroy();
        throw error;
    }
}
