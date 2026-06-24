import { getCurrentUser } from '@/context/index.js';
import { runAfterHooks, runBeforeHooks } from '@/plugins/runtime/plugin-runtime.js';
import { slugify } from '@/utilities/strings.js';
import { createEntrySchemaFor } from '../schema.js';
import { getEntryStorage } from '../storage/registry.js';
import { validate } from '../internal/validation.js';
import { getDefaultLocale, getTitleField } from '../internal/type-config.js';
import { saveRelationships } from '../internal/relationships.js';
import { asEntry } from '../internal/records.js';
import { isPublicBranded, PublicShapeWriteError } from '../visibility.js';
import type { Entry, EntryStatus, JsonObject } from '@/types/index.js';

export async function create(params: {
    type: string;
    title?: string;
    slug?: string;
    locale?: string;
    localeGroup?: string;
    fields?: JsonObject;
    status?: EntryStatus;
    publishAt?: Date | null;
}): Promise<Entry> {
    // Write-back guard: reject public-branded fields objects (defense-in-depth).
    if (params.fields !== undefined && isPublicBranded(params.fields)) {
        throw new PublicShapeWriteError();
    }
    const { type } = params;
    const titleField = getTitleField(type);
    const validated = validate(createEntrySchemaFor(titleField), {
        title: params.title,
        slug: params.slug,
        fields: params.fields,
        status: params.status,
        publishAt: params.publishAt,
    });

    // Titleless types persist `''` rather than undefined (title column is
    // notNull) and never derive a slug from the (absent) title. Titled types
    // are guaranteed a string by the schema; `?? ''` is a no-op narrow there.
    const title = validated.title ?? '';

    const storage = getEntryStorage(type);
    const status = validated.status || 'unpublished';
    const publishedAt =
        status === 'published' ? new Date() : (validated.publishAt ?? null);

    const locale = params.locale ?? getDefaultLocale();
    const localeGroup = params.localeGroup ?? crypto.randomUUID();

    let slug: string | null;
    if (validated.slug) {
        slug = await storage.uniqueSlug(type, locale, validated.slug);
    } else if (titleField === false) {
        // No explicit slug on a titleless type: leave slug null rather than
        // deriving one from the empty title (avoids "-2" style generated slugs).
        slug = null;
    } else {
        slug = await storage.uniqueSlug(type, locale, slugify(title));
    }

    const user = getCurrentUser();
    const createData = {
        title,
        slug,
        locale,
        fields: (validated.fields ?? {}) as JsonObject,
        status,
        publishAt: publishedAt,
    };
    await runBeforeHooks('entry:beforeCreate', { type, data: createData, user }, user);

    const created = asEntry(
        await storage.create({
            type,
            title,
            slug,
            locale,
            localeGroup,
            fields: (validated.fields ?? {}) as JsonObject,
            status,
            publishedAt,
        })
    );

    if (validated.fields) {
        await saveRelationships(created.id, validated.fields as JsonObject, type);
    }

    await runAfterHooks(
        'entry:afterCreate',
        { type, data: createData, user, entry: created },
        user
    );
    return created;
}
