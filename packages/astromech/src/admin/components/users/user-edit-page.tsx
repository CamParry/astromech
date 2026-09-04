/**
 * User edit page.
 *
 * Form with name field (editable) and email field (read-only). `users.fields`
 * is a declared field tree exactly like a global's, so it renders through the
 * same `useEntryForm`/`EntryFieldColumn` building blocks the global edit page
 * uses — a translatable config adds a locale switcher above it. A metadata
 * sidebar shows joined date and last updated.
 */

import type { EntryPayload } from '@/admin/hooks/use-entry-form';
import type { User, UserUpdateData } from '@/types/index';
import { useStore } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryFieldColumn } from '@/admin/components/entries/entry-fields-renderer';
import { EntryFormErrors } from '@/admin/components/entries/entry-form-errors';
import {
    FieldErrorsProvider,
    FieldWarningsProvider,
} from '@/admin/components/fields/field-errors-context';
import { FieldValidationProvider } from '@/admin/components/fields/field-validation-context';
import { Avatar } from '@/admin/components/ui/avatar';
import { Breadcrumb } from '@/admin/components/ui/breadcrumb';
import { Button } from '@/admin/components/ui/button';
import { useConfirm } from '@/admin/components/ui/confirm';
import { Input } from '@/admin/components/ui/input';
import {
    FormLayout,
    Page,
    PageContent,
    PageHeader,
    PageLoading,
    PageTitle,
    Stack,
} from '@/admin/components/ui/page';
import { Panel } from '@/admin/components/ui/panel';
import { Select } from '@/admin/components/ui/select';
import { UserVersionsPanel } from '@/admin/components/users/user-versions-panel';
import { useAiContext } from '@/admin/context/ai-context';
import { useAuth } from '@/admin/context/auth';
import { useEntryForm } from '@/admin/hooks/use-entry-form';
import { usePermissions } from '@/admin/hooks/use-permissions';
import { useDeleteUser, useUpdateUser, useUser } from '@/admin/hooks/users';
import { EntryNamespaceProvider, namespaceForScope } from '@/admin/i18n/entry-namespace';
import { defaultContentLocale, localeOptions } from '@/admin/utilities/content-locale';
import { formatDatetime } from '@/utilities/dates';

export type UserEditPageProps = {
    id: string;
};

export function UserEditPage({ id }: UserEditPageProps): React.ReactElement {
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
    const { canReadUsers } = usePermissions();

    const isSelf = currentUser?.id === id;

    // The page is addressed by `/:id` alone, so the locale being edited is
    // its own state rather than a search param.
    const [locale, setLocale] = useState(defaultContentLocale);
    const { data: user, isLoading } = useUser(id, locale);

    useEffect(() => {
        if (!canReadUsers() && !isSelf) {
            void navigate({ to: '/' });
        }
    }, []);

    if (isLoading || user == null) {
        return <PageLoading />;
    }

    return (
        <UserEditBody
            // Keyed on the record and the locale read: one form instance per
            // set of values. Without this a touched form keeps the previous
            // ones and saves them onto the next.
            key={`${user.id}:${user.locale}:${locale}`}
            id={id}
            user={user}
            locale={locale}
            onLocaleChange={setLocale}
            isSelf={isSelf}
        />
    );
}

type UserEditBodyProps = {
    id: string;
    user: User;
    /** The locale being edited, which `user.locale` falls back from. */
    locale: string;
    onLocaleChange: (locale: string) => void;
    isSelf: boolean;
};

/** The loaded page. Split out so `key` can remount it per record and locale. */
function UserEditBody({
    id,
    user,
    locale,
    onLocaleChange,
    isSelf,
}: UserEditBodyProps): React.ReactElement {
    const confirm = useConfirm();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { canUpdateUsers, canDeleteUsers } = usePermissions();
    const namespace = namespaceForScope('');

    const isTranslatable =
        adminConfig.users.translatable && adminConfig.locales.length > 1;
    const fieldDefinitions = adminConfig.users.fields;
    const canEditRole = canUpdateUsers() && !isSelf;
    const canSave = canUpdateUsers() || isSelf;

    // Declare the user in view. A blank name falls back to the email, which
    // every user has.
    useAiContext(
        { kind: 'users', id, label: user.name !== '' ? user.name : user.email },
        { depth: 1 }
    );

    // `role` sits outside the field tree `useEntryForm` manages (account-level,
    // like `name`/`title`), so it keeps its own state and dirty check.
    const [role, setRole] = useState(user.role);
    const roleDirty = role !== user.role;

    const updateMutation = useUpdateUser(id, {
        ...(isTranslatable ? { locale } : {}),
    });

    const deleteMutation = useDeleteUser({
        id,
        onSuccess: () => void navigate({ to: '/users' }),
    });

    /**
     * `useEntryForm` builds one payload shaped for entries and globals
     * (`title`, `fields`, ...); `name` rides in as its `title` and `role`
     * merges in from its own state. Both write through `useUpdateUser`, so
     * versions, cache invalidation and the saved toast stay the hook's job.
     */
    async function writeUser(payload: EntryPayload): Promise<User> {
        const data: UserUpdateData = { name: payload.title, fields: payload.fields };
        if (canEditRole) data.role = role;
        return updateMutation.mutateAsync(data);
    }

    const {
        form,
        saveMutation,
        handleSave,
        fieldErrors,
        fieldWarnings,
        formErrors,
        fieldValidation,
    } = useEntryForm<User>({
        fieldDefinitions,
        operation: 'update',
        namespace,
        defaultValues: {
            title: user.name,
            fields: user.fields as Record<string, unknown>,
        },
        hasSlug: false,
        hasStatuses: false,
        readOnly: !canSave,
        saveFn: writeUser,
        publishFn: writeUser,
    });

    // `form.state` is a plain getter — reading it in render never re-renders on
    // change, which left Save permanently disabled. Subscribe to the store.
    const isDirty = useStore(form.store, (state) => state.isDirty) || roleDirty;

    return (
        <EntryNamespaceProvider namespace={namespace}>
            <Page>
                <PageHeader>
                    <PageTitle>
                        {user.name !== '' ? user.name : t('users.editUser')}
                    </PageTitle>
                    <Breadcrumb
                        items={[
                            { label: t('users.title'), to: '/users' },
                            { label: user.name !== '' ? user.name : t('users.editUser') },
                        ]}
                    />
                </PageHeader>

                <PageContent>
                    <EntryFormErrors messages={formErrors} />
                    <FieldValidationProvider value={fieldValidation}>
                        <FieldErrorsProvider value={fieldErrors}>
                            <FieldWarningsProvider value={fieldWarnings}>
                                <FormLayout>
                                    {/* Main column */}
                                    <Stack gap={8}>
                                        <Panel title={t('users.profilePanel')}>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '1.25rem',
                                                }}
                                            >
                                                <form.Field
                                                    name="title"
                                                    validators={{
                                                        onChange: ({ value }) =>
                                                            value.trim() === ''
                                                                ? t('users.nameRequired')
                                                                : undefined,
                                                    }}
                                                >
                                                    {(field) => (
                                                        <div className="am-field">
                                                            <label
                                                                className="am-field-label"
                                                                htmlFor="user-name"
                                                            >
                                                                {t('users.nameField')}
                                                            </label>
                                                            <Input
                                                                id="user-name"
                                                                type="text"
                                                                value={field.state.value}
                                                                onChange={(e) =>
                                                                    field.handleChange(
                                                                        e.target.value
                                                                    )
                                                                }
                                                                onBlur={field.handleBlur}
                                                                required
                                                            />
                                                            {field.state.meta.errors
                                                                .length > 0 && (
                                                                <p className="am-field-error">
                                                                    {
                                                                        field.state.meta
                                                                            .errors[0]
                                                                    }
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </form.Field>

                                                <div className="am-field">
                                                    <label
                                                        className="am-field-label"
                                                        htmlFor="user-email"
                                                    >
                                                        {t('users.emailField')}
                                                    </label>
                                                    <Input
                                                        id="user-email"
                                                        type="email"
                                                        value={user.email}
                                                        readOnly
                                                        disabled
                                                        hint={t('users.emailReadonly')}
                                                    />
                                                </div>

                                                {canEditRole && (
                                                    <div className="am-field">
                                                        <label
                                                            className="am-field-label"
                                                            htmlFor="user-role"
                                                        >
                                                            {t('users.roleField')}
                                                        </label>
                                                        <Select
                                                            id="user-role"
                                                            value={role}
                                                            onValueChange={(v) =>
                                                                setRole(v ?? '')
                                                            }
                                                            options={adminConfig.roles.map(
                                                                (r) => ({
                                                                    value: r.slug,
                                                                    label: r.name,
                                                                })
                                                            )}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </Panel>

                                        {(isTranslatable ||
                                            fieldDefinitions.length > 0) && (
                                            <Panel
                                                {...(fieldDefinitions.length > 0
                                                    ? { title: t('users.fieldsPanel') }
                                                    : {})}
                                            >
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '1.25rem',
                                                    }}
                                                >
                                                    {isTranslatable && (
                                                        <div className="am-content-locale">
                                                            <Select
                                                                value={locale}
                                                                onValueChange={(
                                                                    value
                                                                ) => {
                                                                    if (value !== null)
                                                                        onLocaleChange(
                                                                            value
                                                                        );
                                                                }}
                                                                options={localeOptions(
                                                                    user.locales
                                                                )}
                                                            />
                                                            {locale !== user.locale && (
                                                                <p className="am-text-muted am-text-sm">
                                                                    {t(
                                                                        'users.translationFallbackHint',
                                                                        {
                                                                            locale: user.locale.toUpperCase(),
                                                                        }
                                                                    )}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}

                                                    <form.Field name="fields">
                                                        {(field) => (
                                                            <EntryFieldColumn
                                                                nodes={fieldDefinitions}
                                                                values={field.state.value}
                                                                onChange={(name, value) =>
                                                                    field.handleChange({
                                                                        ...field.state
                                                                            .value,
                                                                        [name]: value,
                                                                    })
                                                                }
                                                                disabled={!canSave}
                                                            />
                                                        )}
                                                    </form.Field>
                                                </div>
                                            </Panel>
                                        )}

                                        {/* `user.locale` is the row that was read:
                                            a locale with no row has no versions to
                                            list. */}
                                        <UserVersionsPanel
                                            userId={id}
                                            locale={user.locale}
                                            canUpdate={canUpdateUsers()}
                                        />
                                    </Stack>

                                    {/* Sidebar column */}
                                    <Stack gap={8}>
                                        <Panel title={t('users.actionsPanel')}>
                                            {canSave && (
                                                <Button
                                                    onClick={handleSave}
                                                    loading={saveMutation.isPending}
                                                    disabled={
                                                        !isDirty || saveMutation.isPending
                                                    }
                                                >
                                                    {t('common.save')}
                                                </Button>
                                            )}
                                            {canDeleteUsers() && (
                                                <Button
                                                    variant="danger"
                                                    onClick={() =>
                                                        confirm({
                                                            title: t(
                                                                'users.confirmDeleteTitle'
                                                            ),
                                                            description: t(
                                                                'users.confirmDeleteMessage',
                                                                { name: user.name }
                                                            ),
                                                            confirmLabel:
                                                                t('common.delete'),
                                                            onConfirm: () =>
                                                                deleteMutation.mutate(
                                                                    undefined
                                                                ),
                                                        })
                                                    }
                                                    loading={deleteMutation.isPending}
                                                    style={{
                                                        marginTop: canSave
                                                            ? '0.5rem'
                                                            : undefined,
                                                    }}
                                                >
                                                    {t('common.delete')}
                                                </Button>
                                            )}
                                        </Panel>

                                        <Panel title={t('users.metadataPanel')}>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '0.75rem',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.75rem',
                                                        marginBottom: '0.5rem',
                                                    }}
                                                >
                                                    <Avatar
                                                        name={user.name}
                                                        src={user.image}
                                                        size="md"
                                                    />
                                                    <div>
                                                        <div style={{ fontWeight: 500 }}>
                                                            {user.name}
                                                        </div>
                                                        <div
                                                            style={{
                                                                fontSize: '0.8125rem',
                                                                color: 'var(--am-color-text-muted)',
                                                            }}
                                                        >
                                                            {user.email}
                                                        </div>
                                                    </div>
                                                </div>

                                                <dl className="am-meta">
                                                    <div>
                                                        <dt className="am-meta-label">
                                                            {t('users.joinedLabel')}
                                                        </dt>
                                                        <dd className="am-meta-value">
                                                            {formatDatetime(
                                                                user.createdAt
                                                            )}
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="am-meta-label">
                                                            {t('users.lastUpdatedLabel')}
                                                        </dt>
                                                        <dd className="am-meta-value">
                                                            {formatDatetime(
                                                                user.updatedAt
                                                            )}
                                                        </dd>
                                                    </div>
                                                </dl>
                                            </div>
                                        </Panel>
                                    </Stack>
                                </FormLayout>
                            </FieldWarningsProvider>
                        </FieldErrorsProvider>
                    </FieldValidationProvider>
                </PageContent>
            </Page>
        </EntryNamespaceProvider>
    );
}
