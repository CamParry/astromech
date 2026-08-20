/**
 * Field path grammar — the shared addressing scheme for nested field data,
 * used by both the validation pipeline and the admin renderers. Items are
 * addressed by `_id`, never array index; see `formatInstancePath`/`formatSchemaPath`.
 */

import type { FieldPathSegment } from '@/types/fields';

export type { FieldPathSegment };

/** The three characters a `field` segment may not contain, because the grammar spends them. */
const RESERVED_NAME_CHARS = ['.', '[', ']'] as const;

/**
 * True when `name` can be used as a `field` path segment: non-empty and free of
 * `.`, `[` and `]`.
 *
 * Exported because a field name doesn't always come from a schema an author
 * wrote by hand — a plugin can compose `Field`s from stored JSON — and
 * such a caller needs to reject an unusable name before it reaches a formatter.
 * This is the one place the character rules are stated.
 */
export function isValidFieldName(name: string): boolean {
    return name !== '' && !RESERVED_NAME_CHARS.some((char) => name.includes(char));
}

/**
 * Shared shape check for both formatters. A path has to start at a declared
 * field: an item selector with nothing to select from is meaningless.
 */
function assertValidSegments(segments: readonly FieldPathSegment[]): void {
    if (segments.length === 0) {
        throw new Error('Field path must have at least one segment');
    }

    const first = segments[0];
    if (first !== undefined && first.kind !== 'field') {
        throw new Error(
            `Field path must start with a field segment, got an item selector ('${first.id}')`
        );
    }

    for (const segment of segments) {
        if (segment.kind === 'field') {
            if (segment.name === '') {
                throw new Error('Field path segment name must not be empty');
            }
            if (!isValidFieldName(segment.name)) {
                throw new Error(
                    `Field path segment name must not contain '.', '[' or ']', got '${segment.name}'`
                );
            }
        } else {
            if (segment.id === '') {
                throw new Error('Field path item id must not be empty');
            }
            if (segment.id.includes('[') || segment.id.includes(']')) {
                throw new Error(
                    `Field path item id must not contain '[' or ']', got '${segment.id}'`
                );
            }
        }
    }
}

/**
 * Render segments as an instance path — the address of a concrete stored value,
 * e.g. `sections[a1].items[b2].title`.
 */
export function formatInstancePath(segments: readonly FieldPathSegment[]): string {
    assertValidSegments(segments);

    let out = '';
    for (const segment of segments) {
        if (segment.kind === 'field') {
            out += out === '' ? segment.name : `.${segment.name}`;
        } else {
            out += `[${segment.id}]`;
        }
    }
    return out;
}

/**
 * Render segments as a schema path — the address of a field *definition*, with
 * item selectors collapsed to `[]`, e.g. `sections[].items[].title`.
 */
export function formatSchemaPath(segments: readonly FieldPathSegment[]): string {
    assertValidSegments(segments);

    let out = '';
    for (const segment of segments) {
        if (segment.kind === 'field') {
            out += out === '' ? segment.name : `.${segment.name}`;
        } else {
            out += '[]';
        }
    }
    return out;
}

/**
 * Parse an instance path back into segments.
 *
 * Scans character by character rather than splitting on `.`, because an opaque
 * item id is allowed to contain a dot. Schema paths (`sections[].title`) are not
 * accepted — an empty selector has no item to resolve.
 */
export function parseInstancePath(path: string): FieldPathSegment[] {
    if (path === '') {
        throw new Error('Field path must not be empty');
    }
    if (path.startsWith('[')) {
        throw new Error(
            `Field path must start with a field name, not an item selector: '${path}'`
        );
    }

    const segments: FieldPathSegment[] = [];
    let i = 0;

    while (i < path.length) {
        const nameStart = i;
        while (i < path.length) {
            const char = path[i];
            if (char === '.' || char === '[' || char === ']') break;
            i += 1;
        }

        if (path[i] === ']') {
            throw new Error(`Field path has an unmatched ']' at index ${i}: '${path}'`);
        }

        const name = path.slice(nameStart, i);
        if (name === '') {
            throw new Error(
                `Field path has an empty component at index ${nameStart}: '${path}'`
            );
        }
        segments.push({ kind: 'field', name });

        while (path[i] === '[') {
            const idStart = i + 1;
            i = idStart;
            while (i < path.length && path[i] !== ']' && path[i] !== '[') {
                i += 1;
            }
            if (path[i] !== ']') {
                throw new Error(
                    `Field path has an unterminated item selector at index ${idStart - 1}: '${path}'`
                );
            }
            const id = path.slice(idStart, i);
            i += 1;
            if (id === '') {
                throw new Error(
                    `Field path has an empty item selector at index ${idStart - 1}: '${path}'`
                );
            }
            segments.push({ kind: 'item', id });
        }

        if (i < path.length) {
            if (path[i] !== '.') {
                throw new Error(
                    `Field path has an unexpected '${String(path[i])}' at index ${i}: '${path}'`
                );
            }
            i += 1;
            if (i === path.length) {
                throw new Error(`Field path must not end with '.': '${path}'`);
            }
        }
    }

    return segments;
}
