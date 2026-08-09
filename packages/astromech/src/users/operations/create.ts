import { pruneDanglingRelations } from '@/entries/internal/dangling-relations';
import { ValidationError } from '@/errors/validation';
import { fieldReadsFromRecords } from '@/fields/field-reads';
import { flattenFieldNodes } from '@/fields/flatten';
import { processFields } from '@/fields/pipeline';
import { getCurrentUser } from '@/request-context/index';
import type { JsonObject, User } from '@/types/index';
import config from 'virtual:astromech/config';
import { createUserSchema } from '../schema';
import { createUserStorage } from '../storage';
import { parseWith } from '../internal/parse';
import { indexUserRelationships } from '../internal/relationships';
import { toUser } from '../internal/to-user';
import { query } from './query';

/** Create a CMS user, running its custom fields through the field pipeline. */
export async function create(params: {
    email: string;
    name: string;
    fields?: JsonObject;
    roleSlug?: string;
}): Promise<User> {
    const validated = parseWith(createUserSchema, params);

    const fieldDefs = flattenFieldNodes(config.users?.fields ?? []);
    const resourceValidate = config.users?.validate;
    const processedFields = await processFields(
        (validated.fields ?? {}) as Record<string, unknown>,
        fieldDefs,
        {
            operation: 'create',
            host: { kind: 'user', record: null },
            user: getCurrentUser(),
            reads: fieldReadsFromRecords({
                load: async () => (await query({ limit: 'all' })).data,
                getId: (r) => r.id,
                getFields: (r) => (r.fields ?? {}) as Record<string, unknown>,
            }),
            ...(resourceValidate ? { resourceValidate } : {}),
        }
    );
    if (
        Object.keys(processedFields.errors).length > 0 ||
        processedFields.form.length > 0
    ) {
        throw ValidationError.fromFieldErrors(
            processedFields.errors,
            processedFields.form
        );
    }
    // After `processFields` (its minted item ids are what the traversal
    // needs) and before the write, so the index derives from pruned values.
    const { values: fields } = await pruneDanglingRelations(
        fieldDefs,
        processedFields.values as JsonObject
    );

    const created = await createUserStorage().create({
        email: validated.email,
        name: validated.name,
        ...(Object.keys(fields).length > 0 && { fields }),
        roleSlug: validated.roleSlug,
    });
    await indexUserRelationships(created.id, fields);
    return toUser(created);
}
