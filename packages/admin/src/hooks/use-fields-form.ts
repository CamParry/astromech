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
import { deepEqual } from 'astromech/shared';
import { useMemo, useRef, useState } from 'react';
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
import { useUnsavedChangesGuard } from './use-unsaved-changes-guard';

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
    /**
     * Runs on each submit before the field pipeline, with the submit's `meta`;
     * false stops the submit, and the caller shows why.
     */
    beforeSubmit?: (
        values: FieldsFormValues<TExtras>,
        meta: TMeta | undefined
    ) => boolean;
    /** The stage a submit validates at, `'complete'` unless this says otherwise. */
    validationMode?: (
        values: FieldsFormValues<TExtras>,
        meta: TMeta | undefined
    ) => ValidationMode;
    /** Every field renders disabled, and nothing submits. */
    readOnly?: boolean;
    /** The i18n namespace labels resolve against: a plugin's name, or core's by default. */
    namespace?: string;
    /**
     * Whether Cmd+S submits the form; true unless this says otherwise. Only a
     * page's main form keeps it, so one key press saves one form. It never runs
     * while a modal dialog is open.
     */
    saveHotkey?: boolean;
    /**
     * Reports a failed submit that is not a 422 with field or form messages,
     * in place of the error toast.
     */
    onError?: (error: Error) => void;
};

/** A 422's field and form messages, or `null` for any other error. */
export function readValidationErrors(
    error: Error
): { fields: FieldErrors; form: string[] } | null {
    if (!(error instanceof AstromechApiError) || error.status !== 422) return null;
    const fields = (error.details?.fields ?? {}) as FieldErrors;
    const form = (error.details?.form ?? []) as string[];
    if (Object.keys(fields).length === 0 && form.length === 0) return null;
    return { fields, form };
}

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
    beforeSubmit,
    validationMode,
    readOnly = false,
    namespace = labelNamespace(undefined),
    saveHotkey = true,
    onError,
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
            if (beforeSubmit !== undefined && !beforeSubmit(value, meta)) return;
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
        onSuccess: (saved, { values }) => {
            // Mark the saved values clean. An edit typed while the save was in
            // flight was not saved, so the form stays dirty and still guarded.
            if (deepEqual(form.state.values, values)) form.reset(values);
            onSuccess?.(saved);
        },
        onError: (error) => showError(error),
    });

    /**
     * Show a failed write's error as a failed submit does: a 422 on its fields
     * and in the banner, anything else through `onError` or a toast.
     */
    function showError(error: Error): void {
        const errors = readValidationErrors(error);
        if (errors !== null) {
            const { fields, form: messages } = errors;
            if (messages.length > 0) setFormErrors(messages);
            validation.setServerErrors(fields);
            // A form-level message names no field, so it is its own sentence
            // rather than an entry in the field-name summary.
            const summary =
                Object.keys(fields).length > 0 ? [validationMessage(fields)] : [];
            toast({ message: [...messages, ...summary].join(' '), variant: 'error' });
            return;
        }
        if (onError !== undefined) {
            onError(error);
            return;
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

    useHotkeys(
        'mod+s',
        () => {
            if (isPendingRef.current) return;
            handleSubmit();
        },
        { enabled: saveHotkey }
    );

    // `form` is stable, and its `state` getter reads the live value when asked.
    // A save marks the form clean before `onSuccess`, so its redirect leaves freely.
    const { confirmDiscard } = useUnsavedChangesGuard(() => form.state.isDirty);

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
        showError,
        isDirty,
        confirmDiscard,
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
