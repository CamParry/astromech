/**
 * The entry and global form: `useFieldsForm` with an entry's own keys (title,
 * slug, status, publish date), the payload the entries API takes, and a
 * publish action beside save. The caller supplies both writes.
 */

import type { UseFieldsFormResult } from './use-fields-form';
import type { Entry, EntryStatus, Field, JsonObject } from 'astromech';
import { useStore } from '@tanstack/react-form';
// The function the server uses, so the browser picks the same stage it will.
import { entryValidationMode } from 'astromech/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { validationSummaryMessage } from '../components/fields/field-error-summary';
import { useToast } from '../components/ui/toast';
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
    /**
     * Omitted when the editor left it alone on an update, and always for a
     * statuses-off type, whose API answers 409 to a status write.
     */
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
     * Whether the statuses capability is on. When off, the payload never
     * carries `status` or `publishedAt`.
     */
    hasStatuses?: boolean;
    /** Initial form values; defaults to empty and unpublished. */
    defaultValues?: Partial<EntryFormValues>;
    /** The "save" write, with the status the form holds; resolves to the saved record. */
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
    const { t } = useTranslation();
    const { toast } = useToast();
    /** The publish date's error from the last submit, cleared by a status or date change. */
    const [publishedAtError, setPublishedAtError] = useState<string | undefined>();

    /**
     * The write's payload. An update sends `status` and `publishedAt` only when
     * the editor changed them or pressed Publish, since either needs the publish
     * permission; a create always says which status it makes.
     */
    function buildPayload(values: EntryFormValues, publish: boolean): EntryPayload {
        const status = statusAfter(values, publish);
        const sendsStatus = sendsStatusFor(publish);
        const payload: EntryPayload = {
            title: values.title,
            fields: values.fields as JsonObject,
            // A statuses-off type takes no status write (the API answers 409).
            ...(sendsStatus ? { status } : {}),
        };
        if (hasSlug && values.slug.trim()) {
            payload.slug = values.slug.trim();
        }
        if (
            hasStatuses &&
            status === 'scheduled' &&
            values.publishedAt !== '' &&
            (sendsStatus || changed('publishedAt'))
        ) {
            payload.publishedAt = new Date(values.publishedAt);
        }
        return payload;
    }

    /** Whether a submit's payload names `status`. */
    function sendsStatusFor(publish: boolean): boolean {
        return hasStatuses && (publish || operation === 'create' || changed('status'));
    }

    /**
     * Whether the server would refuse the submit for a schedule with no date:
     * it sends `scheduled` with no date, or clears a scheduled row's date.
     */
    function schedulesWithoutDate(values: EntryFormValues, publish: boolean): boolean {
        return (
            hasStatuses &&
            statusAfter(values, publish) === 'scheduled' &&
            values.publishedAt === '' &&
            (sendsStatusFor(publish) || changed('publishedAt'))
        );
    }

    /** Whether the editor changed this key since the form last loaded or saved. */
    function changed(name: 'status' | 'publishedAt'): boolean {
        return fieldsForm.form.getFieldMeta(name)?.isDirty === true;
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
        beforeSubmit: (values, meta) => {
            const refused = schedulesWithoutDate(values, meta?.publish === true);
            setPublishedAtError(refused ? t('entries.publishedAtRequired') : undefined);
            // Toasted as a failed field check is, since the inline error may be scrolled away.
            if (refused) {
                toast({
                    message: validationSummaryMessage([t('entries.publishedAtField')], t),
                    variant: 'error',
                });
            }
            return !refused;
        },
        // An update that sends no status is validated against the row's own,
        // which is the form's, so the browser and the server pick one stage.
        validationMode: (values, meta) =>
            entryValidationMode({
                status: statusAfter(values, meta?.publish === true),
                hasStatuses,
            }),
        onSubmit: (values, meta) =>
            meta?.publish === true
                ? publishFn(buildPayload(values, true))
                : saveFn(buildPayload(values, false)),
        ...(onSuccess !== undefined ? { onSuccess } : {}),
    });

    const status = useStore(fieldsForm.form.store, (state) => state.values.status);
    const publishedAt = useStore(
        fieldsForm.form.store,
        (state) => state.values.publishedAt
    );
    useEffect(() => setPublishedAtError(undefined), [status, publishedAt]);

    return {
        ...fieldsForm,
        publishedAtError,
        handleSave: (): void => fieldsForm.handleSubmit({ publish: false }),
        handlePublish: (): void => fieldsForm.handleSubmit({ publish: true }),
    };
}

/** The status the row has after a submit, whether or not the payload names it. */
function statusAfter(values: EntryFormValues, publish: boolean): EntryStatus {
    return publish ? 'published' : values.status;
}

/** The TanStack form `useEntryForm` builds, for the entry-only controls that bind to it. */
export type EntryForm = UseFieldsFormResult<
    EntryExtras,
    unknown,
    EntrySubmitMeta
>['form'];
