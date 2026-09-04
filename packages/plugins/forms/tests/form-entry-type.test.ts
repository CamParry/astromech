/**
 * The `form` entry type's own schema, validated through core's pipeline.
 *
 * The only rule under test is the `name` pattern on every field block: a stored
 * `name` becomes a compiled field's name at submit time (`src/fields/
 * compile.ts`), and a submission error is keyed by the field-path grammar,
 * which cannot address a name containing `.`, `[` or `]`. The rule is only
 * reachable server-side because the pipeline recurses into the `fields`
 * blocks container.
 */

import type { Field } from '@/types/fields';
import { describe, expect, it } from 'vitest';
import { safeParseFields } from '@/fields/parse-fields';
import { formEntryType } from '../src/entries/form';

/** The `form` type declares a plain array; narrow the `EntryFields` union to it. */
function definitions(): Field[] {
    const { fields } = formEntryType;
    if (fields === undefined) return [];
    return Array.isArray(fields) ? fields : fields.main;
}

function ctx() {
    return {
        operation: 'create' as const,
        resource: { kind: 'entry' as const, record: {} },
        user: null,
        lookups: { isUnique: async () => true },
    };
}

/** Validate a form whose `fields` holds one text block with the given `name`. */
async function nameErrors(name: unknown): Promise<string[] | undefined> {
    const { errors } = await safeParseFields(
        {
            title: 'Contact',
            fields: [{ _id: 'b1', _type: 'text', name, label: 'Label' }],
        },
        definitions(),
        ctx()
    );
    return errors['fields[b1].name'];
}

describe("form builder's `name` rule", () => {
    it.each(['user.email', 'answers[0]', 'My Field', 'Name', '1st', 'user email'])(
        'rejects %s',
        async (name) => {
            expect(await nameErrors(name)).toEqual([
                'Must start with a lowercase letter and use only lowercase letters, numbers, underscores and hyphens.',
            ]);
        }
    );

    it.each(['user_email', 'email', 'field-2', 'a'])('accepts %s', async (name) => {
        expect(await nameErrors(name)).toBeUndefined();
    });

    it('reports a missing name as required, not as a pattern failure', async () => {
        expect(await nameErrors(undefined)).toEqual(['This field is required']);
    });
});
