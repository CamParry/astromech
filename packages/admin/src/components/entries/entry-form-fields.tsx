/**
 * The entry's own controls, which the entry edit and create pages and the
 * global edit page place inside `<FieldsForm>`: the title, slug and status,
 * each bound to the form `useEntryForm` builds.
 */

import type { EntryForm } from '../../hooks/use-entry-form';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../ui/input';
import { Panel } from '../ui/panel';
import { PublishPanel } from './publish-panel';

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
                    <Input
                        id="entry-title"
                        label={
                            <>
                                {t('entries.titleField')}{' '}
                                <span className="am-field-required">*</span>
                            </>
                        }
                        error={field.state.meta.errors[0]}
                        type="text"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        placeholder={placeholder}
                        disabled={disabled}
                        required
                    />
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

/**
 * The status select and publish date, bound to the form's `status` and
 * `publishedAt`. Without `canPublish` they are read-only, with a note saying why.
 */
export function StatusField({
    form,
    savedPublishedAt,
    disabled = false,
    canPublish,
}: {
    form: EntryForm;
    /** The saved row's publish date, shown once it is live. */
    savedPublishedAt?: Date | string | null | undefined;
    disabled?: boolean;
    /** Whether the user holds the publish permission, which a status change needs. */
    canPublish: boolean;
}): React.ReactElement {
    const { t } = useTranslation();
    // A form that is read-only as a whole says so in its own banner.
    const hint = !disabled && !canPublish ? t('entries.statusNeedsPublish') : undefined;
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
                            readOnly={disabled || !canPublish}
                            hint={hint}
                        />
                    )}
                </form.Field>
            )}
        </form.Field>
    );
}
