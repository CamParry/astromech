import type { createEntryPayloadSchema } from '../schema';
import type {
    EntryCreateContext,
    EntryStatus,
    ResolvedConfig,
    ResolvedEntryType,
    User,
} from '@/types/index';
import type { z } from 'zod';
import { resolvePublishedAt } from '@/content/published-at';
import { parseInput } from '@/errors/validation';
import { createEntrySchema } from '../schema';
import { prepareEntryFields } from './prepare-fields';
import { deriveSlug } from './slug';

/** The content row a new locale writes: what the create hooks see, plus its authorship. */
export type EntryRowWrite = EntryCreateContext['data'] & {
    createdBy: string | null;
    updatedBy: string | null;
};

/**
 * The row a new entry or a new translation writes: `data` parsed under the type's
 * create schema, defaulted, its slug made unique in `locale`, its fields prepared,
 * and its `publishedAt` decided against `current`. Throws a 422.
 */
export async function prepareEntryRow(params: {
    config: ResolvedConfig;
    entryType: ResolvedEntryType;
    locale: string;
    /** The entry a new translation joins; undefined for a new entry. */
    entryId: string | undefined;
    data: Omit<z.input<typeof createEntryPayloadSchema>, 'locale'>;
    /** The row the `publishedAt` rule reads as current; null for a new entry. */
    current: { status: EntryStatus; publishedAt: Date | null } | null;
    user: User | null;
}): Promise<EntryRowWrite> {
    const { config, entryType, locale, entryId, data, current, user } = params;
    const userId = user?.id ?? null;
    const schema = createEntrySchema({ titled: entryType.titleField !== false });

    const validated = parseInput(schema, {
        title: data.title,
        slug: data.slug,
        fields: data.fields,
        status: data.status,
        publishedAt: data.publishedAt,
    });
    const title = validated.title ?? '';
    const status = validated.status ?? 'unpublished';
    const slug = await deriveSlug({ entryType, locale, title, slug: validated.slug });
    const fields = await prepareEntryFields({
        kind: 'create',
        config,
        entryType,
        values: validated.fields ?? {},
        locale,
        entryId,
        status,
        user,
    });

    return {
        title,
        slug,
        locale,
        fields,
        status,
        publishedAt: resolvePublishedAt({
            status,
            given: validated.publishedAt,
            current,
            now: new Date(),
        }),
        createdBy: userId,
        updatedBy: userId,
    };
}
