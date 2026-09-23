/**
 * The form pieces the entry edit and create pages and the global edit page
 * share, each bound to the form `useEntryForm` builds: the two-column layout,
 * the title, slug and status controls, and a column of declared fields.
 */

import type { EntryForm, EntryFormState } from '../../hooks/use-entry-form';
import type { Field } from 'astromech';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    FieldErrorsProvider,
    FieldWarningsProvider,
} from '../fields/field-errors-context';
import { FieldValidationProvider } from '../fields/field-validation-context';
import { Input } from '../ui/input';
import { FormLayout, FormLayoutContent, Stack } from '../ui/page';
import { Panel } from '../ui/panel';
import { EntryFieldColumn } from './entry-fields-renderer';
import { EntryFormErrors } from './entry-form-errors';
import { PublishPanel } from './publish-panel';

/** Main column left, sidebar right, under the form's validation providers. */
export function EntryFormLayout({
    state,
    main,
    sidebar,
}: {
    state: EntryFormState;
    main: React.ReactNode;
    sidebar: React.ReactNode;
}): React.ReactElement {
    return (
        <>
            <EntryFormErrors messages={state.formErrors} />
            <FieldValidationProvider value={state.fieldValidation}>
                <FieldErrorsProvider value={state.fieldErrors}>
                    <FieldWarningsProvider value={state.fieldWarnings}>
                        <FormLayout>
                            <FormLayoutContent>
                                <Stack gap={8}>{main}</Stack>
                                <Stack gap={8}>{sidebar}</Stack>
                            </FormLayoutContent>
                        </FormLayout>
                    </FieldWarningsProvider>
                </FieldErrorsProvider>
            </FieldValidationProvider>
        </>
    );
}

/** The required title input, in its own panel. */
export function TitleField({
    form,
    placeholder,
    disabled = false,
}: {
    form: EntryForm;
    placeholder?: string;
    disabled?: boolean;
}): React.ReactElement {
    const { t } = useTranslation();
    return (
        <Panel>
            <form.Field
                name="title"
                validators={{
                    onChange: ({ value }) =>
                        value.trim() === '' ? t('entries.titleRequired') : undefined,
                }}
            >
                {(field) => (
                    <div className="am-field">
                        <label className="am-field-label" htmlFor="entry-title">
                            {t('entries.titleField')}{' '}
                            <span className="am-field-required">*</span>
                        </label>
                        <Input
                            id="entry-title"
                            type="text"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                            placeholder={placeholder}
                            disabled={disabled}
                            required
                        />
                        {field.state.meta.errors.length > 0 && (
                            <p className="am-field-error">{field.state.meta.errors[0]}</p>
                        )}
                    </div>
                )}
            </form.Field>
        </Panel>
    );
}

/** The slug input, in its own panel; an empty slug is generated from the title. */
export function SlugField({
    form,
    disabled = false,
}: {
    form: EntryForm;
    disabled?: boolean;
}): React.ReactElement {
    const { t } = useTranslation();
    return (
        <form.Field name="slug">
            {(field) => (
                <Panel title={t('entries.slugPanel')}>
                    <div className="am-field">
                        <Input
                            id="entry-slug"
                            type="text"
                            aria-label={t('entries.slugField')}
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                            placeholder="auto-generated-from-title"
                            pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                            disabled={disabled}
                        />
                    </div>
                </Panel>
            )}
        </form.Field>
    );
}

/** The status select and publish date, bound to the form's `status` and `publishedAt`. */
export function StatusField({
    form,
    savedPublishedAt,
    disabled = false,
}: {
    form: EntryForm;
    /** The saved row's publish date, shown once it is live. */
    savedPublishedAt?: Date | string | null | undefined;
    disabled?: boolean;
}): React.ReactElement {
    return (
        <form.Field name="status">
            {(statusField) => (
                <form.Field name="publishedAt">
                    {(publishedAtField) => (
                        <PublishPanel
                            status={statusField.state.value}
                            publishedAt={publishedAtField.state.value}
                            entryPublishedAt={savedPublishedAt}
                            onStatusChange={(status) => statusField.handleChange(status)}
                            onPublishedAtChange={(value) =>
                                publishedAtField.handleChange(value)
                            }
                            readOnly={disabled}
                        />
                    )}
                </form.Field>
            )}
        </form.Field>
    );
}

/** A column of declared fields, reading and writing the form's `fields`. */
export function FieldColumn({
    form,
    nodes,
    disabled = false,
}: {
    form: EntryForm;
    nodes: Field[];
    disabled?: boolean;
}): React.ReactElement {
    return (
        <form.Field name="fields">
            {(field) => (
                <EntryFieldColumn
                    nodes={nodes}
                    values={field.state.value}
                    onChange={(name, value) =>
                        field.handleChange({ ...field.state.value, [name]: value })
                    }
                    disabled={disabled}
                />
            )}
        </form.Field>
    );
}
