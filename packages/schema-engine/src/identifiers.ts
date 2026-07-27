/**
 * Identifier budgeting — keeping every emitted SQL name inside the tightest
 * limit any supported dialect imposes.
 *
 * SQLite and D1 impose no identifier length limit; Postgres truncates at 63
 * bytes and does so with a NOTICE rather than an error, so two names differing
 * only past byte 63 collapse into each other and the second `CREATE` fails with
 * "relation already exists". v1 is SQLite-only, but a name baked into shipped
 * migration SQL can never be renamed, so the budget is enforced now.
 *
 * The rule is asymmetric on purpose:
 *   - **Synthesized** names (indexes, FK constraints) are capped and hashed —
 *     nobody types them, so a mangled tail costs nothing and silence costs a
 *     collision.
 *   - **Table** names are never capped. A table name is something a developer
 *     writes and reads, so overflow is a generate-time error (see `diff.ts`).
 *
 * Pure JS throughout — this module is part of the edge/D1-safe `.` barrel, so
 * no `node:crypto`.
 */

/** Postgres' `NAMEDATALEN - 1`. The tightest limit across supported dialects. */
export const MAX_IDENTIFIER_BYTES = 63;

/** Length of the `_<hash8>` suffix a capped identifier carries. */
const SUFFIX_LENGTH = 9;

/**
 * FNV-1a (32-bit) as 8 lowercase hex digits. Deterministic across runs and
 * platforms — a capped name must be byte-identical every time it is
 * regenerated or every `db:generate` would churn the migration chain.
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
 * Cap an emitted identifier at {@link MAX_IDENTIFIER_BYTES}.
 *
 * Under the cap the name is returned verbatim. Over it, the readable head is
 * truncated and `_<hash8>` appended, totalling exactly 63 bytes. The hash is
 * taken over the FULL logical name, so two names sharing a truncated head stay
 * distinct — which is precisely the Postgres failure this exists to prevent.
 *
 * ASCII only: a multi-byte identifier can't be sliced by character index
 * without risking a split code point, so it is rejected rather than mangled.
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
