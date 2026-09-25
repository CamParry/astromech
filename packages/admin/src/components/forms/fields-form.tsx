/**
 * The form `useFieldsForm` builds, rendered: the form-level errors banner, the
 * validation providers and a two-column layout whose main column defaults to
 * every declared field. `FieldColumn` places a run of fields anywhere inside it.
 */

import type { UseFieldsFormResult } from '../../hooks/use-fields-form';
import type { Field } from 'astromech';
import React from 'react';
import { EntryNamespaceProvider } from '../../i18n/entry-namespace';
import { EntryFieldColumn } from '../entries/entry-fields-renderer';
import {
    FieldErrorsProvider,
    FieldWarningsProvider,
} from '../fields/field-errors-context';
import { FieldValidationProvider } from '../fields/field-validation-context';
import { FormLayout, FormLayoutContent, Stack } from '../ui/page';

/** Any `useFieldsForm` result, whatever the caller's own keys, record and submit meta. */
type AnyFieldsForm = Omit<UseFieldsFormResult, 'form' | 'mutation' | 'handleSubmit'> & {
    form: object;
};

export type FieldsFormProps = {
    /** What `useFieldsForm` returned. */
    form: AnyFieldsForm;
    /** The main column. Defaults to a `FieldColumn` over every declared field. */
    main?: React.ReactNode;
    /** The sidebar column: the caller's actions, and any fields it places there. */
    sidebar?: React.ReactNode;
};

/** Main column left, sidebar right, under the form's validation providers. */
export function FieldsForm({ form, main, sidebar }: FieldsFormProps): React.ReactElement {
    return (
        <EntryNamespaceProvider namespace={form.namespace}>
            <FormErrors messages={form.formErrors} />
            <FieldValidationProvider value={form.fieldValidation}>
                <FieldErrorsProvider value={form.fieldErrors}>
                    <FieldWarningsProvider value={form.fieldWarnings}>
                        <FormLayout>
                            <FormLayoutContent>
                                <Stack gap={8}>
                                    {main ?? <FieldColumn form={form} />}
                                </Stack>
                                <Stack gap={8}>{sidebar}</Stack>
                            </FormLayoutContent>
                        </FormLayout>
                    </FieldWarningsProvider>
                </FieldErrorsProvider>
            </FieldValidationProvider>
        </EntryNamespaceProvider>
    );
}

/** The one key `FieldColumn` binds to, which every `useFieldsForm` form holds. */
type FieldsKeyForm = UseFieldsFormResult['form'];

export type FieldColumnProps = {
    /** What `useFieldsForm` returned. */
    form: AnyFieldsForm;
    /** The fields in this column. Defaults to every declared field. */
    fields?: Field[];
    /** Defaults to the form's `readOnly`. */
    disabled?: boolean;
};

/** A column of declared fields, reading and writing the form's `fields` values. */
export function FieldColumn({
    form,
    fields,
    disabled,
}: FieldColumnProps): React.ReactElement {
    // The caller's own keys make each form a different TanStack type, and its
    // types are invariant; this column touches only `fields`, which all share.
    const tanstackForm = form.form as FieldsKeyForm;
    return (
        <tanstackForm.Field name="fields">
            {(field) => (
                <EntryFieldColumn
                    nodes={fields ?? form.fieldDefinitions}
                    values={field.state.value}
                    onChange={(name, value) =>
                        field.handleChange({ ...field.state.value, [name]: value })
                    }
                    disabled={disabled ?? form.readOnly}
                />
            )}
        </tanstackForm.Field>
    );
}

/**
 * Form-level messages from a 422. A live region here, not per field, since it
 * appears in response to a submit and names no field for the announcement to clip.
 */
function FormErrors({ messages }: { messages: string[] }): React.ReactElement | null {
    if (messages.length === 0) return null;
    return (
        <div className="am-form-errors" role="alert">
            {messages.map((message) => (
                <span key={message}>{message}</span>
            ))}
        </div>
    );
}
