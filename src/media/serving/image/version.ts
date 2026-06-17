/** Short content version for immutable variant URLs. SHA-256 (crypto.subtle — Workers-safe), first 12 hex chars. */
export async function contentVersion(bytes: Uint8Array): Promise<string> {
    // Ensure we have a plain ArrayBuffer (not SharedArrayBuffer) for crypto.subtle.
    const input: ArrayBuffer =
        bytes.buffer instanceof ArrayBuffer
            ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
            : new Uint8Array(bytes).buffer;
    const buffer = await crypto.subtle.digest('SHA-256', input);
    const hex = Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    return hex.slice(0, 12);
}
