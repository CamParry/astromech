/**
 * Shared form logic for collection entry create and edit pages.
 *
 * Owns: useForm setup, buildPayload, save/publish mutations, Cmd+S shortcut,
 * beforeunload dirty-state guard, and toast error handling.
 *
 * The caller supplies `saveFn` / `publishFn` as the actual client calls so that
 * create and edit can use different endpoints while sharing everything else.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useForm, useStore } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useHotkeys } from './index.js';
import { useFieldValidation } from './use-field-validation.js';
import { useToast } from '../components/ui/index.js';
import {
    fieldErrorNames,
    validationSummaryMessage,
} from '@/admin/components/fields/field-error-summary.js';
import { resolveLabel } from '@/admin/i18n/labels.js';
import type {
    Entry,
    EntryStatus,
    FieldDefinition,
    FieldErrors,
    JsonObject,
} from '../../types/index.js';
// Deep import of a pure leaf: the browser must pick the same stage the server
// will, and the entries barrel would drag a domain service into the bundle.
import { entryValidationStage } from '@/entries/validation-stage.js';
import { AstromechApiError } from '../../transport/http/client/index.js';

// ============================================================================
// Types
// ============================================================================

export type EntryFormValues = {
    title: string;
    slug: string;
    status: EntryStatus;
    publishAt: string;
    fields: Record<string, unknown>;
};

export type EntryPayload = {
    title: string;
    slug?: string;
    fields: JsonObject;
    /** Omitted for statuses-off types so the API doesn't 409 on a status write. */
    status?: EntryStatus;
    publishAt?: Date | null;
};

type UseEntryFormOptions = {
    /**
     * The type's full field tree (`[...main, ...sidebar]`), which the browser
     * runs the server's own pipeline over before letting a submit through.
     */
    fieldDefinitions: FieldDefinition[];
    /** Which pipeline operation a submit performs — `'create'` seeds defaults. */
    operation: 'create' | 'update';
    /**
     * The i18n namespace field labels resolve against — `namespaceForScope(cacheScope)`.
     * Passed rather than read from `EntryNamespaceProvider`, because this hook is
     * called ABOVE that provider and `useLabel()` would answer for the wrong one.
     */
    namespace: string;
    /** Whether this collection has a slug field. */
    hasSlug: boolean;
    /**
     * Whether the statuses capability is on. When off, the payload omits
     * `status`/`publishAt` so the API doesn't 409 on a statuses-off type.
     * Defaults to true (titled/standard types are unaffected).
     */
    hasStatuses?: boolean;
    /** Initial form values; defaults to empty/unpublished. */
    defaultValues?: Partial<EntryFormValues>;
    /**
     * The mutation function for the "save" action (save as unpublished / update).
     * Receives the built payload; must return a Promise<Entry>.
     */
    saveFn: (payload: EntryPayload) => Promise<Entry>;
    /**
     * The mutation function for the "publish" action.
     * Receives the built payload (status forced to 'published'); must return a Promise<Entry>.
     */
    publishFn: (payload: EntryPayload) => Promise<Entry>;
    /** Called after either mutation succeeds, with the returned entry. */
    onSuccess?: (entry: Entry) => void;
    /** When true, save and publish actions become no-ops. */
    readOnly?: boolean;
};

// ============================================================================
// Hook
// ============================================================================

export function useEntryForm({
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
}: UseEntryFormOptions) {
    const { toast } = useToast();
    const { t } = useTranslation();

    /**
     * Name the fields that failed rather than pointing at highlights the author
     * has to hunt for — the fields that fail a publish are typically the empty
     * ones they never scrolled to.
     */
    function validationMessage(errors: FieldErrors): string {
        const names = fieldErrorNames(errors, fieldDefinitions, (label) =>
            // The label is always present here (the resolver substitutes the
            // field's own name), so the name fallback is unreachable.
            resolveLabel(label, '', t, namespace)
        );
        return validationSummaryMessage(names, t);
    }

    /**
     * Which action the in-flight submit is. Save and publish share one submit
     * path so both run TanStack's own field validators (the title one the entry
     * pages register lives there); `handleSubmit` takes no argument we can thread
     * the intent through, so it rides in a ref that `handlePublish` clears again.
     */
    const publishIntentRef = useRef(false);

    const form = useForm({
        defaultValues: {
            title: defaultValues?.title ?? '',
            slug: defaultValues?.slug ?? '',
            status: defaultValues?.status ?? ('unpublished' as EntryStatus),
            publishAt: defaultValues?.publishAt ?? '',
            fields: defaultValues?.fields ?? ({} as Record<string, unknown>),
        },
        onSubmit: async ({ value }) => {
            const publishing = publishIntentRef.current;
            const payload = buildPayload(value, publishing ? 'published' : undefined);
            // The stage comes from the payload rather than a hardcoded 'publish'
            // so the browser and the server agree in every case, including a
            // statuses-off type whose payload carries no status at all.
            const errors = await validation.validateAll(
                entryValidationStage({ status: payload.status, hasStatuses })
            );
            if (Object.keys(errors).length > 0) {
                toast({ message: validationMessage(errors), variant: 'error' });
                return;
            }
            if (publishing) publishMutation.mutate(payload);
            else saveMutation.mutate(payload);
        },
    });

    // The entry's field tree sits under a single `form.Field name="fields"`, so
    // TanStack's per-field validators/blur tracking never see the individual
    // fields — only this subscription does. Subscribing here is what makes the
    // re-validate-while-erroring effect fire on each keystroke.
    const fieldValues = useStore(form.store, (state) => state.values.fields);

    const validation = useFieldValidation({
        definitions: fieldDefinitions,
        values: fieldValues,
        operation,
    });

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
        if (hasStatuses && status === 'scheduled' && values.publishAt) {
            payload.publishAt = new Date(values.publishAt);
        }
        return payload;
    }

    function handleFieldError(err: Error, fallback: string): void {
        if (err instanceof AstromechApiError && err.status === 422) {
            const fields = (err.details?.fields ?? {}) as FieldErrors;
            if (Object.keys(fields).length > 0) {
                validation.setServerErrors(fields);
                toast({ message: validationMessage(fields), variant: 'error' });
                return;
            }
        }
        toast({
            message: err instanceof Error ? err.message : fallback,
            variant: 'error',
        });
    }

    const saveMutation: UseMutationResult<Entry, Error, EntryPayload> = useMutation<
        Entry,
        Error,
        EntryPayload
    >({
        mutationFn: saveFn,
        onSuccess: (entry) => {
            // Reset dirty state without changing values
            form.reset(form.state.values);
            onSuccess?.(entry);
        },
        onError: (err) => {
            handleFieldError(err, 'Save failed');
        },
    });

    const publishMutation: UseMutationResult<Entry, Error, EntryPayload> = useMutation<
        Entry,
        Error,
        EntryPayload
    >({
        mutationFn: publishFn,
        onSuccess: (entry) => {
            form.reset(form.state.values);
            onSuccess?.(entry);
        },
        onError: (err) => {
            handleFieldError(err, 'Publish failed');
        },
    });

    function handleSave(): void {
        if (readOnly) return;
        validation.resetServerErrors();
        // Goes through handleSubmit so TanStack's own title validator runs first.
        void form.handleSubmit();
    }

    function handlePublish(): void {
        if (readOnly) return;
        validation.resetServerErrors();
        publishIntentRef.current = true;
        // Cleared once the submit settles so a later plain save isn't published.
        void form.handleSubmit().finally(() => {
            publishIntentRef.current = false;
        });
    }

    // Cmd/Ctrl+S — save shortcut. Use a ref so the handler always sees the
    // latest isPending value without requiring the hotkey to re-register.
    const isPendingRef = useRef(saveMutation.isPending);
    isPendingRef.current = saveMutation.isPending;

    useHotkeys('mod+s', () => {
        if (readOnly || isPendingRef.current) return;
        validation.resetServerErrors();
        void form.handleSubmit();
    });

    // Warn on browser tab close when there are unsaved changes
    useEffect(() => {
        function handleBeforeUnload(e: BeforeUnloadEvent): void {
            if (!form.state.isDirty) return;
            e.preventDefault();
        }
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
        // form is stable; isDirty is read via the ref on the stable form object
    }, []);

    // Stable identity: this object is handed straight to a context provider.
    const fieldValidation = useMemo(
        () => ({
            onFieldChange: validation.markDirty,
            onFieldBlur: validation.reportBlur,
        }),
        [validation.markDirty, validation.reportBlur]
    );

    return {
        form,
        saveMutation,
        publishMutation,
        handleSave,
        handlePublish,
        buildPayload,
        readOnly,
        fieldErrors: validation.errors,
        fieldValidation,
    };
}

/** The return type of `useEntryForm`, derived from the hook itself. */
export type UseEntryFormReturn = ReturnType<typeof useEntryForm>;
