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
import { Input } from '../ui/input';
import { Page, PageContent, PageHeader, PageTitle, Stack } from '../ui/page';
import { Panel } from '../ui/panel';
import { Select } from '../ui/select';

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
                                                        field.handleChange(e.target.value)
                                                    }
                                                    onBlur={field.handleBlur}
                                                    required
                                                />
                                                {field.state.meta.errors.length > 0 && (
                                                    <p className="am-field-error">
                                                        {field.state.meta.errors[0]}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </form.Field>

                                    <form.Field
                                        name="email"
                                        validators={{
                                            onChange: ({ value }) =>
                                                value.trim() === ''
                                                    ? t('common.required')
                                                    : undefined,
                                        }}
                                    >
                                        {(field) => (
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
                                                    value={field.state.value}
                                                    onChange={(e) =>
                                                        field.handleChange(e.target.value)
                                                    }
                                                    onBlur={field.handleBlur}
                                                    required
                                                />
                                                {field.state.meta.errors.length > 0 && (
                                                    <p className="am-field-error">
                                                        {field.state.meta.errors[0]}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </form.Field>

                                    <form.Field name="role">
                                        {(field) => (
                                            <div className="am-field">
                                                <label
                                                    className="am-field-label"
                                                    htmlFor="user-role"
                                                >
                                                    {t('users.roleField')}
                                                </label>
                                                <Select
                                                    id="user-role"
                                                    value={field.state.value}
                                                    onValueChange={(v) =>
                                                        field.handleChange(v ?? '')
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
