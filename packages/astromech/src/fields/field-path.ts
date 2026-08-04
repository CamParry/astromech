/**
 * Field path grammar — the single shared addressing scheme for nested field data.
 *
 * Two independent subsystems have to agree, character for character, on how a
 * value buried inside a `group` / `repeater` / `blocks` / `tree` container is
 * named:
 *   - the field validation pipeline, which keys its error map by these paths;
 *   - the admin field renderers, which rebuild the same path so that
 *     `useFieldError(path)` finds the error the server produced.
 * A single mismatch means an error that exists but is never displayed, so the
 * grammar lives here rather than being re-derived at each site. A future
 * relationships index will key on the schema-path form.
 *
 * ## Items are addressed by `_id`, never by array index
 *
 * A container stores its items as an array, and that array's order is the only
 * place item order lives. Editors reorder, insert and delete items, so an
 * item's index shifts between form load and save — a path like `blocks[2].title`
 * can silently point at a different item than the one it was built for. The
 * persisted `_id` doesn't move, so `item` segments select by id.
 *
 * ## Two rendered forms
 *
 * An *instance* path locates a value: `field` segments join with `.`, and an
 * `item` segment renders as `[<id>]` appended directly to the segment before it
 * with no separating dot.
 *
 *     seo.title
 *     blocks[6f1e2a].heading
 *     sections[a1].items[b2].title
 *
 * A *schema* path locates a field *definition* rather than a value, so the
 * particular item is irrelevant: it is identical except every `item` segment
 * renders as empty brackets.
 *
 *     sections[].items[].title
 *
 * ## `_children` is never a segment
 *
 * The `tree` field type self-nests through a structural `_children` array. Item
 * ids are unique across a whole tree, so a node at any depth addresses as
 * `nav[<id>].label` — the depth never appears in the path. Paths chain only
 * through fields a schema author declared; structural keys (`_children`) are
 * skipped entirely.
 *
 * Item ids are opaque strings — real ones come from `crypto.randomUUID()`, which
 * contains `-` — so nothing here assumes an id character set beyond the brackets
 * it must not contain.
 *
 * Pure module: its only import is type-only (erased at build), so it is safe to
 * load in the browser. The formatters and parser are deliberately not
 * re-exported from `fields/index.js`, because that barrel reaches server code
 * and browser consumers must deep-import this file instead. `isValidFieldName`
 * is the one exception: it is on the public `astromech/fields` surface so a
 * plugin composing fields from stored JSON can check a name it did not author.
 *
 * `FieldPathSegment` itself is declared with the other field contracts in
 * `types/fields.ts` — the field-type descriptor and the validation context both
 * reference it, and the pure leaf layer may not import a capability. It is
 * re-exported here so this module stays the one place to reach for the grammar.
 */

import type { FieldPathSegment } from '@/types/fields.js';

export type { FieldPathSegment };

/** The three characters a `field` segment may not contain, because the grammar spends them. */
const RESERVED_NAME_CHARS = ['.', '[', ']'] as const;

/**
 * True when `name` can be used as a `field` path segment: non-empty and free of
 * `.`, `[` and `]`.
 *
 * Exported because a field name doesn't always come from a schema an author
 * wrote by hand — a plugin can compose `FieldDefinition`s from stored JSON — and
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
