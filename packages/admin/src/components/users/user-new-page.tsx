/**
 * User create page: `useFieldsForm` over the declared `users.fields`, with the
 * name, email and role beside them. Sends a user who may not create users back
 * to the dashboard.
 */

import type { JsonObject } from 'astromech';
import { useNavigate } from '@tanstack/react-router';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { useFieldsForm } from '../../hooks/use-fields-form';
import { usePermissions } from '../../hooks/use-permissions';
import { userMutations } from '../../hooks/users';
import { labelNamespace } from '../../i18n/entry-namespace';
import { FieldColumn, FieldsForm } from '../forms/fields-form';
import { Breadcrumb } from '../ui/breadcrumb';
import { Button } from '../ui/button';
import { Page, PageContent, PageHeader, PageTitle, Stack } from '../ui/page';
import { Panel } from '../ui/panel';
import { requiredValidator, UserRoleField, UserTextField } from './user-profile-fields';

/** The account's own keys, held beside the declared fields' `fields`. */
type UserFormExtras = { name: string; email: string; role: string };

export function UserNewPage(): React.ReactElement {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { canCreateUsers } = usePermissions();

    useEffect(() => {
        if (!canCreateUsers()) {
            void navigate({ to: '/' });
        }
    }, []);

    const fieldDefinitions = adminConfig.users.fields;

    // The form reports a failed create, a 422 onto its fields.
    const createMutation = useAdminMutation(userMutations().create, {
        toastError: false,
    });

    const userForm = useFieldsForm<UserFormExtras>({
        fieldDefinitions,
        operation: 'create',
        namespace: labelNamespace(undefined),
        defaultValues: { name: '', email: '', role: adminConfig.roles[0]?.slug ?? '' },
        onSubmit: (values) =>
            createMutation.mutateAsync({
                name: values.name,
                email: values.email,
                role: values.role,
                fields: values.fields as JsonObject,
            }),
        onSuccess: () => void navigate({ to: '/users' }),
    });
    const { form, mutation, handleSubmit } = userForm;

    return (
        <Page>
            <PageHeader>
                <PageTitle>{t('users.createTitle')}</PageTitle>
                <Breadcrumb
                    items={[
                        { label: t('users.title'), to: '/users' },
                        { label: t('users.createTitle') },
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

                                    <form.Field
                                        name="email"
                                        validators={{
                                            onChange: requiredValidator(
                                                t('common.required')
                                            ),
                                        }}
                                    >
                                        {(field) => (
                                            <UserTextField
                                                id="user-email"
                                                label={t('users.emailField')}
                                                type="email"
                                                field={field}
                                                required
                                            />
                                        )}
                                    </form.Field>

                                    <form.Field name="role">
                                        {(field) => (
                                            <UserRoleField
                                                label={t('users.roleField')}
                                                field={field}
                                            />
                                        )}
                                    </form.Field>
                                </Stack>
                            </Panel>

                            {fieldDefinitions.length > 0 && (
                                <Panel title={t('users.fieldsPanel')}>
                                    <FieldColumn form={userForm} />
                                </Panel>
                            )}
                        </>
                    }
                    sidebar={
                        <Panel title={t('users.actionsPanel')}>
                            <Button
                                onClick={() => handleSubmit()}
                                loading={mutation.isPending}
                                disabled={mutation.isPending}
                            >
                                {t('common.create')}
                            </Button>
                        </Panel>
                    }
                />
            </PageContent>
        </Page>
    );
}
