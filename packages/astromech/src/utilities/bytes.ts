/**
 * Byte helpers for a body that may be a stream.
 */

/** Read a body into one `Uint8Array`, holding a stream's whole content in memory. */
export async function toBytes(body: ReadableStream | Uint8Array): Promise<Uint8Array> {
    if (body instanceof Uint8Array) return body;
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}
