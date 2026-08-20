/**
 * Identifier budgeting — keeping every emitted SQL name inside the tightest
 * limit any supported dialect imposes (Postgres truncates at 63 bytes). Only
 * synthesized names (indexes, FK constraints) are capped and hashed; table names never are.
 */

/** Postgres' `NAMEDATALEN - 1`. The tightest limit across supported dialects. */
export const MAX_IDENTIFIER_BYTES = 63;

/** Length of the `_<hash8>` suffix a capped identifier carries. */
const SUFFIX_LENGTH = 9;

/**
 * FNV-1a (32-bit) as 8 lowercase hex digits. Deterministic across runs and
 * platforms, since a capped name must be byte-identical every time it renders.
 */
export function hash8(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i) & 0xff;
        // 32-bit FNV prime (16777619) via shifts — keeps the product in range.
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

/**
 * Cap an emitted identifier at {@link MAX_IDENTIFIER_BYTES}. Under the cap the
 * name is returned verbatim; over it, the readable head is truncated and
 * `_<hash8>` appended. ASCII only — a non-ASCII name is rejected, not mangled.
 */
export function capIdentifier(name: string): string {
    if (!isAscii(name)) {
        throw new Error(
            `[schema-engine] identifier "${name}" contains non-ASCII characters — ` +
                `identifier length is budgeted in bytes and cannot be capped safely. ` +
                `Use ASCII table, column and index names.`
        );
    }
    if (name.length <= MAX_IDENTIFIER_BYTES) return name;
    const head = name.slice(0, MAX_IDENTIFIER_BYTES - SUFFIX_LENGTH);
    return `${head}_${hash8(name)}`;
}

/** ASCII-only, so `String.length` is also the byte length. */
export function isAscii(name: string): boolean {
    for (let i = 0; i < name.length; i++) {
        if (name.charCodeAt(i) > 0x7f) return false;
    }
    return true;
}
