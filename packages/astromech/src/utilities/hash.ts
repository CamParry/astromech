/** SHA-256 hashing through `crypto.subtle`, which Workers have too. */

/** SHA-256 hex of `text`. */
export async function sha256Hex(text: string): Promise<string> {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}
