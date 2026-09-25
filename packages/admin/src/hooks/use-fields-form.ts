/**
 * A form over declared fields, for any record: the TanStack form, the field
 * pipeline run in the browser, a 422 mapped onto the fields, Cmd+S and the
 * unsaved-changes guard. `<FieldsForm>` renders it and `useEntryForm` builds on it.
 */

import type { UseMutationResult } from '@tanstack/react-query';
import type { Field, FieldErrors, ValidationMode } from 'astromech';
import { useForm, useStore } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { AstromechApiError } from 'astromech/fetch';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    fieldErrorNames,
    validationSummaryMessage,
} from '../components/fields/field-error-summary';
import { useToast } from '../components/ui/toast';
import { labelNamespace } from '../i18n/entry-namespace';
import { resolveLabel } from '../i18n/labels';
import { useFieldValidation } from './use-field-validation';
import { useHotkeys } from './use-hotkeys';

/**
 * What the form holds: the declared fields' values under `fields`, and the
 * caller's own keys (an entry's `title`, a user's `email`) beside them.
 */
export type FieldsFormValues<TExtras extends object = Record<never, never>> = TExtras & {
    fields: Record<string, unknown>;
};

export type UseFieldsFormOptions<TExtras extends object, TSaved, TMeta> = {
    /** The field tree the form renders, and validates before a submit goes out. */
    fieldDefinitions: Field[];
    /** Which pipeline operation a submit performs: `'create'` seeds defaults. */
    operation: 'create' | 'update';
    /** Starting values: the fields' own under `fields`, the caller's keys beside it. */
    defaultValues?: TExtras & { fields?: Record<string, unknown> };
    /**
     * Writes the values and resolves to the saved record. A rejection with a
     * 422 fills in the fields' errors and the form's banner.
     */
    onSubmit: (
        values: FieldsFormValues<TExtras>,
        meta: TMeta | undefined
    ) => Promise<TSaved>;
    /** Called with the saved record once the form has been reset to its values. */
    onSuccess?: (saved: TSaved) => void;
    /** The stage a submit validates at, `'complete'` unless this says otherwise. */
    validationMode?: (
        values: FieldsFormValues<TExtras>,
        meta: TMeta | undefined
    ) => ValidationMode;
    /** Every field renders disabled, and nothing submits. */
    readOnly?: boolean;
    /** The i18n namespace labels resolve against: a plugin's name, or core's by default. */
    namespace?: string;
};

/**
 * `TExtras` is the caller's own keys, `TSaved` what `onSubmit` resolves to,
 * and `TMeta` what a caller passes `handleSubmit` to tell one submit from
 * another (the entry form's publish intent).
 */
export function useFieldsForm<
    TExtras extends object = Record<never, never>,
    TSaved = unknown,
    TMeta = undefined,
>({
    fieldDefinitions,
    operation,
    defaultValues,
    onSubmit,
    onSuccess,
    validationMode,
    readOnly = false,
    namespace = labelNamespace(undefined),
}: UseFieldsFormOptions<TExtras, TSaved, TMeta>) {
    const { toast } = useToast();
    const { t } = useTranslation();

    /** Form-level messages from a 422; they belong to no field. */
    const [formErrors, setFormErrors] = useState<string[]>([]);

    /**
     * Name the fields that failed rather than pointing at highlights the author
     * has to hunt for: the fields that fail are typically the empty ones they
     * never scrolled to.
     */
    function validationMessage(errors: FieldErrors): string {
        const names = fieldErrorNames(errors, fieldDefinitions, (label) =>
            // The label is always present here (the resolver substitutes the
            // field's own name), so the name fallback is unreachable.
            resolveLabel(label, '', t, namespace)
        );
        return validationSummaryMessage(names, t);
    }

    const initialValues = {
        ...defaultValues,
        fields: defaultValues?.fields ?? {},
    } as FieldsFormValues<TExtras>;

    const form = useForm({
        defaultValues: initialValues,
        // Types the `meta` a caller hands `handleSubmit`.
        onSubmitMeta: undefined as TMeta | undefined,
        onSubmit: async ({ value, meta }) => {
            const errors = await validation.validateAll(
                validationMode?.(value, meta) ?? 'complete'
            );
            if (Object.keys(errors).length > 0) {
                toast({ message: validationMessage(errors), variant: 'error' });
                return;
            }
            mutation.mutate({ values: value, meta });
        },
    });

    // The field tree sits under one `form.Field name="fields"`, so TanStack's
    // per-field validators and blur tracking never see the individual fields;
    // only this subscription does, and it drives re-validation while erroring.
    const fieldValues = useStore(form.store, (state) => state.values.fields);
    // `form.state` is a getter: reading it in render never re-renders.
    const isDirty = useStore(form.store, (state) => state.isDirty);

    const validation = useFieldValidation({
        definitions: fieldDefinitions,
        values: fieldValues,
        operation,
    });

    const mutation: UseMutationResult<
        TSaved,
        Error,
        { values: FieldsFormValues<TExtras>; meta: TMeta | undefined }
    > = useMutation({
        mutationFn: ({ values, meta }) => onSubmit(values, meta),
        onSuccess: (saved) => {
            // Clear the dirty state without changing the values.
            form.reset(form.state.values);
            onSuccess?.(saved);
        },
        onError: (error) => handleError(error),
    });

    function handleError(error: Error): void {
        if (error instanceof AstromechApiError && error.status === 422) {
            const fields = (error.details?.fields ?? {}) as FieldErrors;
            const messages = (error.details?.form ?? []) as string[];
            if (messages.length > 0) setFormErrors(messages);
            if (Object.keys(fields).length > 0 || messages.length > 0) {
                validation.setServerErrors(fields);
                // A form-level message names no field, so it is its own sentence
                // rather than an entry in the field-name summary.
                const summary =
                    Object.keys(fields).length > 0 ? [validationMessage(fields)] : [];
                toast({ message: [...messages, ...summary].join(' '), variant: 'error' });
                return;
            }
        }
        toast({
            message: error.message !== '' ? error.message : t('common.error'),
            variant: 'error',
        });
    }

    /** Clear the last response's messages, then submit unless the form is read-only. */
    function handleSubmit(meta?: TMeta): void {
        if (readOnly) return;
        validation.resetServerErrors();
        setFormErrors([]);
        // Through `form.handleSubmit` so a caller's own TanStack validators run first.
        void form.handleSubmit(meta);
    }

    // Read through a ref so the hotkey sees the latest value without re-registering.
    const isPendingRef = useRef(mutation.isPending);
    isPendingRef.current = mutation.isPending;

    useHotkeys('mod+s', () => {
        if (isPendingRef.current) return;
        handleSubmit();
    });

    // Warn on closing the tab with unsaved changes. `form` is stable, and its
    // `state` getter reads the live value when the event fires.
    useEffect(() => {
        function handleBeforeUnload(event: BeforeUnloadEvent): void {
            if (!form.state.isDirty) return;
            event.preventDefault();
        }
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
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
        mutation,
        handleSubmit,
        isDirty,
        readOnly,
        fieldDefinitions,
        namespace,
        formErrors,
        fieldErrors: validation.errors,
        fieldWarnings: validation.warnings,
        fieldValidation,
    };
}

/** What `useFieldsForm` returns, which `<FieldsForm>` and `<FieldColumn>` render. */
export type UseFieldsFormResult<
    TExtras extends object = Record<never, never>,
    TSaved = unknown,
    TMeta = undefined,
> = ReturnType<typeof useFieldsForm<TExtras, TSaved, TMeta>>;
