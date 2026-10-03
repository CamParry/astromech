/**
 * Whether a create needs the author to fill in fields, for the forms that leave
 * a resource's fields out unless they must: first-run setup and the upload dialog.
 */

import type { Field, FieldErrors } from 'astromech';
import { safeParseFields } from 'astromech/shared';

/**
 * Whether a create sending no field values would be refused, which is when a
 * required field has no default. Runs the field pipeline the server runs, so a
 * field type's own default counts as one.
 */
export async function requiresFieldValues(
    definitions: Field[],
    kind: 'user' | 'media'
): Promise<boolean> {
    const errors = await requiredFieldErrors(definitions, kind);
    return Object.keys(errors).length > 0;
}

/**
 * The errors a create sending no field values would get, by field path: one
 * for each required field with no default.
 */
export async function requiredFieldErrors(
    definitions: Field[],
    kind: 'user' | 'media'
): Promise<FieldErrors> {
    const { errors } = await safeParseFields({}, definitions, {
        operation: 'create',
        validation: 'complete',
        resource: { kind, record: null },
        user: null,
    });
    return errors;
}
