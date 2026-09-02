import type { GlobalRow, GlobalsRepository } from '../repository/globals-table';
import type { Global, GlobalUpdateData, JsonObject, ResolvedGlobal } from '@/types/index';
import { propagateSharedFields } from '@/content/translatable';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';
import { isPublicBranded, PublicShapeWriteError } from '@/content/visibility';
import { transaction } from '@/database/transaction';
import { parseInput } from '@/errors/validation';
import { flattenEntryFields } from '@/fields/flatten';
import { runHook } from '@/hooks/hooks';
import { getCurrentUser } from '@/request-context/request-context';
import {
    asGlobal,
    globalRepository,
    resolveGlobal,
    resolveLocale,
} from '../internal/global';
import { patchedFieldNames, toStoredFields } from '../internal/stored-fields';
import { updateGlobalSchema } from '../schema';

/**
 * Writes one locale of one global, firing the global write hooks around it.
 * Rows are created on demand: a global nothing has saved gets its `globals` row
 * and this locale's content row, and a translatable global whose locale has no
 * row gets one with the shared fields inherited from the default-locale row.
 */
export async function updateGlobal(params: {
    key: string;
    locale?: string;
    data: GlobalUpdateData;
}): Promise<Global> {
    if (isPublicBranded(params.data.fields)) throw new PublicShapeWriteError();

    const global = resolveGlobal(params.key);
    const locale = resolveLocale(global, params.locale);
    const repository = globalRepository();
    const user = await getCurrentUser();

    const id = await repository.idByKey(params.key);
    const current = id === null ? null : await repository.get({ id, locale });

    // The before-hook may replace the context, and with it the patch that is
    // written — so it runs before the fields are parsed, not just before the
    // transaction opens.
    const context = await runHook('global:beforeUpdate', {
        key: params.key,
        locale,
        global: current ? asGlobal(current) : null,
        data: {
            fields: parseInput(updateGlobalSchema, params.data).fields as JsonObject,
        },
        user,
    });
    // Re-parsed: a hook may have replaced `data` wholesale, and what it handed
    // back is as unvalidated as what the caller sent.
    const patch = parseInput(updateGlobalSchema, context.data).fields as JsonObject;

    const fields = await toStoredFields({
        repository,
        global,
        id,
        locale,
        patch,
        current,
    });

    const saved = await transaction(async () => {
        if (current && global.capabilities.versioning) {
            if (changesVersionedContent(current, { fields })) {
                await snapshotVersion(repository.versions, current);
            }
        }
        return writeRow({
            repository,
            global,
            key: params.key,
            id,
            locale,
            current,
            fields,
            userId: user?.id ?? null,
            patchedNames: patchedFieldNames(patch),
        });
    });

    await runHook('global:afterUpdate', {
        key: params.key,
        locale,
        global: saved,
        data: { fields: patch },
        user,
    });

    return saved;
}

/**
 * Write the row this locale needs — the global's first row, this locale's first
 * row, or an edit of one that exists — and copy the shared fields the write
 * touched out to the global's other locales.
 */
async function writeRow(params: {
    repository: GlobalsRepository;
    global: ResolvedGlobal;
    key: string;
    id: string | null;
    locale: string;
    current: GlobalRow | null;
    fields: JsonObject;
    userId: string | null;
    patchedNames: string[];
}): Promise<Global> {
    const { repository, global, id, locale, current, fields, userId } = params;

    const row =
        id === null
            ? await repository.create(
                  { key: params.key },
                  {
                      locale,
                      fields,
                      status: 'unpublished',
                      publishedAt: null,
                      createdBy: userId,
                      updatedBy: userId,
                  }
              )
            : await repository.update(
                  { id, locale },
                  {
                      fields,
                      // Moves with `updatedAt`, not with the version snapshot.
                      updatedBy: userId,
                      // A locale being written for the first time is authored
                      // now, whoever created the global itself.
                      ...(current ? {} : { createdBy: userId }),
                  }
              );

    await propagateSharedFields({
        translatable: repository.translatable,
        definitions: flattenEntryFields(global.fields),
        isTranslatable: global.capabilities.translatable,
        record: { id: row.id, locale: row.locale },
        fields,
        patchedFieldNames: params.patchedNames,
    });

    return asGlobal(row);
}
