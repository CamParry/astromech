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
import { UnknownEntryTypeError } from '../errors.js';
import { createEntryScopedReads } from '../reads.js';
import { resolveEntryType } from '../type-registry.js';
import { entryValidationStage } from '../validation-stage.js';
import { flattenEntryFields } from '@/fields/helpers.js';
import { processFields } from '@/fields/pipeline.js';
import { getDocumentValidator } from '@/fields/document-validators.js';
import { ValidationError } from '@/errors/index.js';
import config from 'virtual:astromech/config';
import type { EntryStorage, StorageDb } from '../storage/types.js';
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
    // Reject an unresolvable type up front. There are no field definitions to
    // validate against, so proceeding would write a ghost row stamped with a
    // type nothing can render or query.
    const entryTypeConfig = resolveEntryType(config, type);
    if (!entryTypeConfig) throw new UnknownEntryTypeError(type);
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

    const user = getCurrentUser();
    const fieldDefs = flattenEntryFields(entryTypeConfig.fields);

    const incomingFields = (validated.fields ?? {}) as Record<string, unknown>;

    // Registry first: the Astro config is JSON, so an authored `validate` only
    // survives boot's registration. The config value is the fallback for the
    // live-config paths (CLI, tests).
    const documentValidate =
        getDocumentValidator(`entry:${type}`) ?? entryTypeConfig.validate;

    const processed = await processFields(incomingFields, fieldDefs, {
        operation: 'create',
        stage: entryValidationStage({
            status,
            hasStatuses: entryTypeConfig.capabilities.statuses !== false,
        }),
        host: { kind: 'entry', record: null },
        user,
        reads: createEntryScopedReads(storage, { type, locale }),
        ...(documentValidate ? { documentValidate } : {}),
    });
    if (Object.keys(processed.errors).length > 0 || processed.form.length > 0) {
        throw ValidationError.fromFieldErrors(processed.errors, processed.form);
    }
    const processedFields = processed.values as JsonObject;

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

    const createData = {
        title,
        slug,
        locale,
        fields: processedFields,
        status,
        publishAt: publishedAt,
    };
    await runBeforeHooks('entry:beforeCreate', { type, data: createData, user }, user);

    // The row and its derived relationship rows go in together or not at all.
    // Storages that can't open a transaction fall back to sequential writes.
    const persist = async (
        txStorage: EntryStorage,
        txDb: StorageDb | undefined
    ): Promise<Entry> => {
        const row = asEntry(
            await txStorage.create({
                type,
                title,
                slug,
                locale,
                // Absent means "start a fresh translation group"; storage's
                // descriptor mints the ULID.
                localeGroup: params.localeGroup,
                fields: processedFields,
                status,
                publishedAt,
            })
        );
        if (Object.keys(processedFields).length > 0) {
            await saveRelationships(row.id, processedFields, type, txDb);
        }
        return row;
    };
    const created = storage.transaction
        ? await storage.transaction(persist)
        : await persist(storage, undefined);

    await runAfterHooks(
        'entry:afterCreate',
        { type, data: createData, user, entry: created },
        user
    );
    return created;
}
