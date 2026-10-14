/**
 * User edit page.
 *
 * `useFieldsForm` over the declared `users.fields`, with the name and role
 * beside them; the email is read-only. A translatable config adds a locale
 * switcher above the fields, and the sidebar shows the account's dates.
 */

import type { JsonObject, User, UserUpdateData } from 'astromech';
import { useNavigate } from '@tanstack/react-router';
import { defaultContentLocale } from 'astromech/shared';
import { Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { useAiContext } from '../../context/ai-context';
import { useAuth } from '../../context/auth';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { useFieldsForm } from '../../hooks/use-fields-form';
import { usePermissions } from '../../hooks/use-permissions';
import { userMutations, useUser, useUserVersions } from '../../hooks/users';
import { labelNamespace, LabelNamespaceProvider } from '../../i18n/label-namespace';
import { localeOptions } from '../../utilities/content-locale';
import { FieldColumn, FieldsForm } from '../forms/fields-form';
import { ForbiddenPage } from '../layout/forbidden-page';
import { Breadcrumb } from '../ui/breadcrumb';
import { useConfirm } from '../ui/confirm';
import { MoreActionsMenu } from '../ui/more-actions-menu';
import {
    Page,
    PageContent,
    PageHeader,
    PageHeaderActions,
    PageLoading,
    PageTitle,
    Stack,
} from '../ui/page';
import { Panel } from '../ui/panel';
import { SaveButton } from '../ui/save-button';
import { Select } from '../ui/select';
import { ContentVersionsPanel } from '../versions/content-versions-panel';
import { requiredValidator, UserRoleField, UserTextField } from './user-profile-fields';
import { UserSummaryPanel } from './user-summary-panel';

/** The account's own keys, held beside the declared fields' `fields`. */
type UserFormExtras = { name: string; role: string };

export type UserEditPageProps = {
    id: string;
};

export function UserEditPage({ id }: UserEditPageProps): React.ReactElement {
    const { user: currentUser } = useAuth();
    const { users } = usePermissions();
    const isSelf = currentUser?.id === id;
    if (!users.can('read') && !isSelf) return <ForbiddenPage />;
    return <UserEdit id={id} isSelf={isSelf} />;
}

/** Loads the user in the locale being edited, then renders the form. */
function UserEdit({ id, isSelf }: { id: string; isSelf: boolean }): React.ReactElement {
    // The page is addressed by `/:id` alone, so the locale being edited is
    // its own state rather than a search param.
    const [locale, setLocale] = useState(() => defaultContentLocale(adminConfig));
    const { data: user, isLoading } = useUser(id, locale);

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
    const { users } = usePermissions();
    const namespace = labelNamespace(undefined);

    const isTranslatable =
        adminConfig.users.translatable && adminConfig.locales.length > 1;
    const fieldDefinitions = adminConfig.users.fields;
    const canEditRole = users.can('update') && !isSelf;
    const canSave = users.can('update') || isSelf;

    // Declare the user in view. A blank name falls back to the email, which
    // every user has.
    useAiContext(
        { kind: 'users', id, label: user.name !== '' ? user.name : user.email },
        { depth: 1 }
    );

    // The form reports a failed save, a 422 onto its fields.
    const updateMutation = useAdminMutation(userMutations().update, {
        toastError: false,
    });

    // The user is gone, so their unsaved edits are not worth asking about.
    const deleteMutation = useAdminMutation(userMutations().delete, {
        onSuccess: () => void navigate({ to: '/users', ignoreBlocker: true }),
    });

    // `user.locale` is the row that was read: a locale with no row has no
    // versions to list.
    const versions = useUserVersions(id, user.locale);
    const restoreVersionMutation = useAdminMutation(userMutations().restoreVersion);

    const userForm = useFieldsForm<UserFormExtras, User>({
        fieldDefinitions,
        operation: 'update',
        namespace,
        defaultValues: { name: user.name, role: user.role, fields: user.fields },
        readOnly: !canSave,
        // Through `userMutations().update`, so cache invalidation and the saved
        // toast stay the table's job.
        onSubmit: (values) => {
            const data: UserUpdateData = {
                name: values.name,
                fields: values.fields as JsonObject,
            };
            if (canEditRole) data.role = values.role;
            return updateMutation.mutateAsync({
                id,
                locale: isTranslatable ? locale : undefined,
                data,
            });
        },
    });
    const { form, mutation, handleSubmit, isDirty, confirmDiscard } = userForm;

    return (
        <LabelNamespaceProvider namespace={namespace}>
            <Page>
                <PageHeader>
                    <PageTitle>
                        <Breadcrumb
                            items={[
                                { label: t('users.title'), to: '/users' },
                                {
                                    label:
                                        user.name !== ''
                                            ? user.name
                                            : t('users.editUser'),
                                },
                            ]}
                        />
                    </PageTitle>
                    <PageHeaderActions>
                        {canSave && isDirty && (
                            <span className="am-form-layout-dirty-indicator">
                                {t('common.unsavedChanges')}
                            </span>
                        )}
                        {canSave && (
                            <SaveButton
                                onClick={() => handleSubmit()}
                                loading={mutation.isPending}
                                disabled={!isDirty || mutation.isPending}
                            >
                                {t('common.save')}
                            </SaveButton>
                        )}
                        {users.can('delete') && (
                            <MoreActionsMenu
                                items={[
                                    {
                                        label: t('common.delete'),
                                        icon: <Trash2 size={14} />,
                                        onClick: () =>
                                            confirm({
                                                title: t('users.confirmDeleteTitle'),
                                                description: t(
                                                    'users.confirmDeleteMessage',
                                                    { name: user.name }
                                                ),
                                                confirmLabel: t('common.delete'),
                                                onConfirm: () =>
                                                    deleteMutation.mutate(id),
                                            }),
                                        disabled: deleteMutation.isPending,
                                        variant: 'danger',
                                    },
                                ]}
                            />
                        )}
                    </PageHeaderActions>
                </PageHeader>

                <PageContent>
                    <FieldsForm
                        form={userForm}
                        main={
                            <>
                                <Panel title={t('users.profilePanel')}>
                                    <Stack gap={5}>
                                        <form.Field
                                            name="name"
                                            validators={{
                                                onChange: requiredValidator(
                                                    t('users.nameRequired')
                                                ),
                                            }}
                                        >
                                            {(field) => (
                                                <UserTextField
                                                    id="user-name"
                                                    label={t('users.nameField')}
                                                    type="text"
                                                    field={field}
                                                    required
                                                />
                                            )}
                                        </form.Field>

                                        <UserTextField
                                            id="user-email"
                                            label={t('users.emailField')}
                                            type="email"
                                            value={user.email}
                                            readOnly
                                            disabled
                                            hint={t('users.emailReadonly')}
                                        />

                                        {canEditRole && (
                                            <form.Field name="role">
                                                {(field) => (
                                                    <UserRoleField
                                                        label={t('users.roleField')}
                                                        field={field}
                                                    />
                                                )}
                                            </form.Field>
                                        )}
                                    </Stack>
                                </Panel>

                                {(isTranslatable || fieldDefinitions.length > 0) && (
                                    <Panel
                                        {...(fieldDefinitions.length > 0
                                            ? { title: t('users.fieldsPanel') }
                                            : {})}
                                    >
                                        <Stack gap={5}>
                                            {isTranslatable && (
                                                <div className="am-content-locale">
                                                    <Select
                                                        value={locale}
                                                        // The switch remounts the form, so it asks first.
                                                        onValueChange={(value) => {
                                                            if (value === null) return;
                                                            confirmDiscard(() =>
                                                                onLocaleChange(value)
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

                                            <FieldColumn form={userForm} />
                                        </Stack>
                                    </Panel>
                                )}

                                <ContentVersionsPanel
                                    versions={versions.data ?? []}
                                    isLoading={versions.isLoading}
                                    isError={versions.isError}
                                    canUpdate={users.can('update')}
                                    onRestore={(version) =>
                                        restoreVersionMutation.mutate({
                                            id,
                                            locale: user.locale,
                                            version,
                                        })
                                    }
                                    isRestoring={restoreVersionMutation.isPending}
                                />
                            </>
                        }
                        sidebar={<UserSummaryPanel user={user} />}
                    />
                </PageContent>
            </Page>
        </LabelNamespaceProvider>
    );
}
