/**
 * User edit page.
 *
 * `useFieldsForm` over the declared `users.fields`, with the name and role
 * beside them; the email is read-only. A translatable config adds a locale
 * switcher above the fields, and the sidebar shows the account's dates.
 */

import type { JsonObject, User, UserUpdateData } from 'astromech';
import { useNavigate } from '@tanstack/react-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { useAiContext } from '../../context/ai-context';
import { useAuth } from '../../context/auth';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { useFieldsForm } from '../../hooks/use-fields-form';
import { usePermissions } from '../../hooks/use-permissions';
import { userMutations, useUser } from '../../hooks/users';
import { EntryNamespaceProvider, labelNamespace } from '../../i18n/entry-namespace';
import { defaultContentLocale, localeOptions } from '../../utilities/content-locale';
import { FieldColumn, FieldsForm } from '../forms/fields-form';
import { Breadcrumb } from '../ui/breadcrumb';
import { Button } from '../ui/button';
import { useConfirm } from '../ui/confirm';
import {
    ButtonGroup,
    Page,
    PageContent,
    PageHeader,
    PageLoading,
    PageTitle,
    Stack,
} from '../ui/page';
import { Panel } from '../ui/panel';
import { Select } from '../ui/select';
import { requiredValidator, UserRoleField, UserTextField } from './user-profile-fields';
import { UserSummaryPanel } from './user-summary-panel';
import { UserVersionsPanel } from './user-versions-panel';

/** The account's own keys, held beside the declared fields' `fields`. */
type UserFormExtras = { name: string; role: string };

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
    const namespace = labelNamespace(undefined);

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

    // The form reports a failed save, a 422 onto its fields.
    const updateMutation = useAdminMutation(userMutations().update, {
        toastError: false,
    });

    const deleteMutation = useAdminMutation(userMutations().delete, {
        onSuccess: () => void navigate({ to: '/users' }),
    });

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
    const { form, mutation, handleSubmit, isDirty } = userForm;

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
                                                        onValueChange={(value) => {
                                                            if (value !== null)
                                                                onLocaleChange(value);
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

                                {/* `user.locale` is the row that was read:
                                            a locale with no row has no versions to
                                            list. */}
                                <UserVersionsPanel
                                    userId={id}
                                    locale={user.locale}
                                    canUpdate={canUpdateUsers()}
                                />
                            </>
                        }
                        sidebar={
                            <>
                                <Panel title={t('users.actionsPanel')}>
                                    <ButtonGroup>
                                        {canSave && (
                                            <Button
                                                onClick={() => handleSubmit()}
                                                loading={mutation.isPending}
                                                disabled={!isDirty || mutation.isPending}
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
                                                        confirmLabel: t('common.delete'),
                                                        onConfirm: () =>
                                                            deleteMutation.mutate(id),
                                                    })
                                                }
                                                loading={deleteMutation.isPending}
                                            >
                                                {t('common.delete')}
                                            </Button>
                                        )}
                                    </ButtonGroup>
                                </Panel>

                                <UserSummaryPanel user={user} />
                            </>
                        }
                    />
                </PageContent>
            </Page>
        </EntryNamespaceProvider>
    );
}
