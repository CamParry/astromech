import type { JsonObject, User, UserUpdateData } from '@/types/index';
import { getConfig } from '@/config/registry';
import { propagateSharedFields } from '@/content/translatable';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { pruneDanglingRelations } from '@/entries/internal/dangling-relations';
import { parseInput } from '@/errors/validation';
import { flattenFieldNodes } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { mergePatch, projectToSchema } from '@/fields/values';
import { requireRole } from '@/permissions/roles';
import { getCurrentUser } from '@/request-context/request-context';
import { UserNotFoundError } from '../errors';
import { resolveUserLocale, userRepository } from '../internal/locale';
import { createUserLookups } from '../internal/lookups';
import { indexUserRelationships } from '../internal/relationships';
import { toUser } from '../internal/to-user';
import { updateUserSchema } from '../schema';

/**
 * Update a user's profile, role and custom fields. `name`, `email` and `role`
 * are the account row and are written whatever the locale; `fields` addresses
 * one locale's content row, and a locale with none gets one seeded from the
 * default-locale row with the patch applied over it.
 */
export async function updateUser(params: {
    id: string;
    locale?: string;
    data: UserUpdateData;
}): Promise<User> {
    const { id } = params;
    const locale = resolveUserLocale(params.locale);
    const repository = userRepository();

    // The row this write edits, or — when the locale has none — the
    // default-locale row the new one is copied from.
    const current = await repository.getExact(id, locale);
    const base = current ?? (await repository.get(id));
    if (!base) throw new UserNotFoundError({ id });

    const data = parseInput(updateUserSchema, params.data);
    const config = getConfig();
    if (data.role !== undefined) requireRole(config, data.role);

    const definitions = flattenFieldNodes(config.users.fields);
    const patch = data.fields as Record<string, unknown> | undefined;
    const patchedNames =
        patch === undefined
            ? []
            : Object.keys(patch).filter((name) => patch[name] !== undefined);

    // A patch is merged over `base`, so a locale being written for the first
    // time is seeded from the default-locale row. A write naming no `fields` at
    // all touches the account row alone and creates no content row.
    let fields: JsonObject | undefined;
    if (patch !== undefined) {
        // `fields` is a patch: an omitted field keeps its stored value, an
        // explicit `null` stores null, and a container replaces wholesale.
        const merged = mergePatch(base.fields, patch);
        const parsed = await parseFields(merged, definitions, {
            operation: 'update',
            resource: { kind: 'user', record: toUser(base) },
            user: await getCurrentUser(),
            lookups: createUserLookups(repository, { locale, excludeId: id }),
            coerceOnly: new Set(patchedNames),
            ...(config.users.validate ? { validate: config.users.validate } : {}),
        });
        // After `parseFields` (its minted item ids are what the traversal
        // needs) and before the write, so the index derives from the pruned
        // values.
        const pruned = await pruneDanglingRelations(
            definitions,
            projectToSchema(parsed, definitions) as JsonObject
        );
        fields = pruned.values;
    }

    const { name, email, role } = data;
    const userId = (await getCurrentUser())?.id ?? null;

    // The version, the account write, the content write and the index write are
    // one transaction: an index that outlived a failed write would name
    // relations the stored fields do not.
    await transaction(async () => {
        if (current && changesVersionedContent(current, { fields }, [])) {
            await snapshotVersion(repository.versions, current, {});
        }
        if (name !== undefined || email !== undefined || role !== undefined) {
            await repository.updateAccount(id, { name, email, role });
        }
        if (fields !== undefined) {
            await repository.update(
                { id, locale },
                {
                    fields,
                    updatedBy: userId,
                    // A locale being written for the first time is authored
                    // now, whoever created the account.
                    ...(current ? {} : { createdBy: userId }),
                }
            );
        }
        // An update that never touched `fields` must leave the index and the
        // user's other locales alone.
        if (fields !== undefined && patch !== undefined) {
            await propagateSharedFields({
                translatable: repository.translatable,
                definitions,
                isTranslatable: config.users.translatable,
                record: { id, locale },
                fields,
                patchedFieldNames: patchedNames,
            });
            await indexUserRelationships(id);
        }
    });

    const updated = await repository.get(id, locale);
    if (!updated) throw new UserNotFoundError({ id });
    return toUser(updated);
}
