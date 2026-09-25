/**
 * The entry and global form: `useFieldsForm` with an entry's own keys (title,
 * slug, status, publish date), the payload the entries API takes, and a
 * publish action beside save. The caller supplies both writes.
 */

import type { UseFieldsFormResult } from './use-fields-form';
import type { Entry, EntryStatus, Field, JsonObject } from 'astromech';
// The function the server uses, so the browser picks the same stage it will.
import { entryValidationMode } from 'astromech/shared';
import { useFieldsForm } from './use-fields-form';

/** The entry's own keys, held beside the declared fields' `fields`. */
type EntryExtras = {
    title: string;
    slug: string;
    status: EntryStatus;
    publishedAt: string;
};

export type EntryFormValues = EntryExtras & { fields: Record<string, unknown> };

export type EntryPayload = {
    title: string;
    slug?: string;
    fields: JsonObject;
    /** Omitted for statuses-off types so the API doesn't 409 on a status write. */
    status?: EntryStatus;
    publishedAt?: Date | null;
};

/** Which write a submit makes. */
type EntrySubmitMeta = { publish: boolean };

/**
 * `TSaved` is what the caller's write resolves to: an `Entry` for the entry
 * pages, a `Global` for the global one. The hook never reads it; it only hands
 * it back to `onSuccess`.
 */
type UseEntryFormOptions<TSaved> = {
    /**
     * The type's full field tree (`[...main, ...sidebar]`), which the browser
     * runs the server's own pipeline over before letting a submit through.
     */
    fieldDefinitions: Field[];
    /** Which pipeline operation a submit performs: `'create'` seeds defaults. */
    operation: 'create' | 'update';
    /** The i18n namespace field labels resolve against: `namespaceForScope(cacheScope)`. */
    namespace: string;
    /** Whether this entry type has a slug field. */
    hasSlug: boolean;
    /**
     * Whether the statuses capability is on. When off, the payload omits
     * `status`/`publishedAt` so the API doesn't 409 on a statuses-off type.
     */
    hasStatuses?: boolean;
    /** Initial form values; defaults to empty and unpublished. */
    defaultValues?: Partial<EntryFormValues>;
    /** The "save" write (save as unpublished, or update); resolves to the saved record. */
    saveFn: (payload: EntryPayload) => Promise<TSaved>;
    /** The "publish" write, handed the payload with its status forced to `published`. */
    publishFn: (payload: EntryPayload) => Promise<TSaved>;
    /** Called after either write succeeds, with the saved record. */
    onSuccess?: (record: TSaved) => void;
    /** When true, save and publish do nothing. */
    readOnly?: boolean;
};

export function useEntryForm<TSaved = Entry>({
    fieldDefinitions,
    operation,
    namespace,
    hasSlug,
    hasStatuses = true,
    defaultValues,
    saveFn,
    publishFn,
    onSuccess,
    readOnly = false,
}: UseEntryFormOptions<TSaved>) {
    function buildPayload(
        values: EntryFormValues,
        overrideStatus?: EntryStatus
    ): EntryPayload {
        const status = overrideStatus ?? values.status;
        const payload: EntryPayload = {
            title: values.title,
            fields: values.fields as JsonObject,
            // Omit status entirely for statuses-off types (the API 409s on a
            // status write there); the entries service defaults to 'unpublished'.
            ...(hasStatuses ? { status } : {}),
        };
        if (hasSlug && values.slug.trim()) {
            payload.slug = values.slug.trim();
        }
        if (hasStatuses && status === 'scheduled' && values.publishedAt) {
            payload.publishedAt = new Date(values.publishedAt);
        }
        return payload;
    }

    function payloadFor(
        values: EntryFormValues,
        meta: EntrySubmitMeta | undefined
    ): EntryPayload {
        return buildPayload(values, meta?.publish === true ? 'published' : undefined);
    }

    const fieldsForm = useFieldsForm<EntryExtras, TSaved, EntrySubmitMeta>({
        fieldDefinitions,
        operation,
        namespace,
        readOnly,
        defaultValues: {
            title: defaultValues?.title ?? '',
            slug: defaultValues?.slug ?? '',
            status: defaultValues?.status ?? 'unpublished',
            publishedAt: defaultValues?.publishedAt ?? '',
            fields: defaultValues?.fields ?? {},
        },
        // The stage comes from the payload rather than a hardcoded 'publish'
        // so the browser and the server agree in every case, including a
        // statuses-off type whose payload carries no status at all.
        validationMode: (values, meta) =>
            entryValidationMode({ status: payloadFor(values, meta).status, hasStatuses }),
        onSubmit: (values, meta) =>
            meta?.publish === true
                ? publishFn(payloadFor(values, meta))
                : saveFn(payloadFor(values, meta)),
        ...(onSuccess !== undefined ? { onSuccess } : {}),
    });

    return {
        ...fieldsForm,
        handleSave: (): void => fieldsForm.handleSubmit({ publish: false }),
        handlePublish: (): void => fieldsForm.handleSubmit({ publish: true }),
        buildPayload,
    };
}

/** The TanStack form `useEntryForm` builds, for the entry-only controls that bind to it. */
export type EntryForm = UseFieldsFormResult<
    EntryExtras,
    unknown,
    EntrySubmitMeta
>['form'];
