import type { MediaRow } from '../repository';
import type { JsonObject, Media, MediaUpdateData } from '@/types/index';
import { getConfig } from '@/config/registry';
import { propagateSharedFields } from '@/content/translatable';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { pruneDanglingRelations } from '@/entries/internal/dangling-relations';
import { parseInput } from '@/errors/validation';
import { flattenFieldNodes } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { mergePatch, projectToSchema } from '@/fields/values';
import { getCurrentUser } from '@/request-context/request-context';
import { MediaNotFoundError } from '../errors';
import { mediaRepository, resolveMediaLocale } from '../internal/locale';
import { createMediaLookups } from '../internal/lookups';
import { indexMediaRelationships } from '../internal/relationships';
import { toMedia } from '../internal/to-media';
import { updateMediaSchema } from '../schema';

/** The content columns a version snapshots, so a change to one is versioned. */
const VERSIONED_COLUMNS = ['title', 'alt', 'caption'] as const;

/**
 * Update one locale of a media item's authored content. A locale with no row yet
 * gets one seeded from the default-locale row with the patch applied over it, so
 * a read does not change shape when the translation is created.
 */
export async function updateMedia(params: {
    id: string;
    locale?: string;
    data: MediaUpdateData;
}): Promise<Media> {
    const { id } = params;
    const locale = resolveMediaLocale(params.locale);
    const repository = mediaRepository();

    // The row this write edits, or — when the locale has none — the
    // default-locale row the new one is copied from.
    const current = await repository.getExact(id, locale);
    const base = current ?? (await repository.get(id));
    if (!base) throw new MediaNotFoundError({ id });

    const data = parseInput(updateMediaSchema, params.data);
    const config = getConfig();
    const definitions = flattenFieldNodes(config.media.fields ?? []);

    const patch = data.fields as Record<string, unknown> | undefined;
    const patchedNames =
        patch === undefined
            ? []
            : Object.keys(patch).filter((name) => patch[name] !== undefined);

    let fields: JsonObject | undefined;
    if (patch !== undefined) {
        // `fields` is a patch: an omitted field keeps its stored value, an
        // explicit `null` stores null, and a container replaces wholesale.
        const merged = mergePatch(base.fields, patch);
        const parsed = await parseFields(merged, definitions, {
            operation: 'update',
            resource: { kind: 'media', record: toMedia(base) },
            user: await getCurrentUser(),
            lookups: createMediaLookups(repository, { locale, excludeId: id }),
            coerceOnly: new Set(patchedNames),
            ...(config.media.validate ? { validate: config.media.validate } : {}),
        });
        // After `parseFields` (its minted item ids are what the traversal
        // needs) and before the write, so the index derives from the pruned
        // values.
        const pruned = await pruneDanglingRelations(
            definitions,
            projectToSchema(parsed, definitions) as JsonObject
        );
        fields = pruned.values;
    } else if (!current) {
        // The copy carries the source row's fields unchanged.
        fields = base.fields;
    }

    const next = {
        title: inherited(data.title, current, base, 'title'),
        alt: inherited(data.alt, current, base, 'alt'),
        caption: inherited(data.caption, current, base, 'caption'),
        fields,
    };

    const user = await getCurrentUser();
    const userId = user?.id ?? null;

    // The version, the row write and the index write are one transaction: an
    // index that outlived a failed write would name relations the stored fields
    // do not.
    const updated = await transaction(async () => {
        if (current && changesVersionedContent(current, next, VERSIONED_COLUMNS)) {
            await snapshotVersion(repository.versions, current, {
                title: current.title,
                alt: current.alt,
                caption: current.caption,
            });
        }
        // `updatedAt` is stamped by the repository (the column declares
        // `onUpdate`); an explicitly-`undefined` key means "leave this column
        // alone".
        const row = await repository.update(
            { id, locale },
            {
                ...next,
                updatedBy: userId,
                // A locale being written for the first time is authored now,
                // whoever uploaded the file.
                ...(current ? {} : { createdBy: userId }),
            }
        );
        // An update that never touched `fields` must leave the index and the
        // item's other locales alone.
        if (fields !== undefined && patch !== undefined) {
            await propagateSharedFields({
                translatable: repository.translatable,
                definitions,
                isTranslatable: config.media.translatable,
                record: { id, locale },
                fields,
                patchedFieldNames: patchedNames,
            });
            await indexMediaRelationships(id);
        }
        return row;
    });

    return toMedia(updated);
}

/**
 * The value one text column takes. An omitted key is left alone on an edit, and
 * copied from the source row when the locale's row is being created.
 */
function inherited(
    value: string | null | undefined,
    current: MediaRow | null,
    base: MediaRow,
    column: 'title' | 'alt' | 'caption'
): string | null | undefined {
    if (value !== undefined) return value;
    return current ? undefined : base[column];
}
