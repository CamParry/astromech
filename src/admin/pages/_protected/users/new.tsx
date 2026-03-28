/**
 * User create page.
 *
 * Form with name, email, and role fields.
 * Guarded: redirects to dashboard if the current user lacks users:create permission.
 */

import React, { useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import {
    Button,
    Panel,
    Breadcrumb,
    Input,
    Select,
    Page,
    PageHeader,
    PageTitle,
    PageContent,
    FormLayout,
    FormLayoutMain,
    FormLayoutSidebar,
} from '@/admin/components/ui/index.js';
import { usePermissions, useCreateUser } from '@/admin/hooks/index.js';
import adminConfig from 'virtual:astromech/admin-config';

// ============================================================================
// Types
// ============================================================================

type FormValues = {
    name: string;
    email: string;
    roleSlug: string;
};

// ============================================================================
// Page
// ============================================================================

function UserCreatePage(): React.ReactElement {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { canCreateUsers } = usePermissions();

    useEffect(() => {
        if (!canCreateUsers()) {
            void navigate({ to: '/' });
        }
    }, []);

    const defaultRole = adminConfig.roles[0]?.slug ?? '';

    const createMutation = useCreateUser({
        onSuccess: () => void navigate({ to: '/users' }),
    });

    const form = useForm({
        defaultValues: {
            name: '',
            email: '',
            roleSlug: defaultRole,
        } satisfies FormValues,
        onSubmit: ({ value }) => {
            createMutation.mutate({
                name: value.name,
                email: value.email,
                roleSlug: value.roleSlug,
            });
        },
    });

    function handleSave() {
        void form.handleSubmit();
    }

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
            <FormLayout>
                {/* Main column */}
                <FormLayoutMain>
                    <Panel title={t('users.profilePanel')}>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1.25rem',
                            }}
                        >
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
                                            className="am-field__label"
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
                                            <p className="am-field__error">
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
                                            className="am-field__label"
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
                                            <p className="am-field__error">
                                                {field.state.meta.errors[0]}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </form.Field>

                            <form.Field name="roleSlug">
                                {(field) => (
                                    <div className="am-field">
                                        <label
                                            className="am-field__label"
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
                                            options={adminConfig.roles.map((r) => ({
                                                value: r.slug,
                                                label: r.name,
                                            }))}
                                        />
                                    </div>
                                )}
                            </form.Field>
                        </div>
                    </Panel>
                </FormLayoutMain>

                {/* Sidebar column */}
                <FormLayoutSidebar>
                    <Panel title={t('users.actionsPanel')}>
                        <Button
                            onClick={handleSave}
                            loading={createMutation.isPending}
                            disabled={form.state.isSubmitting}
                        >
                            {t('common.create')}
                        </Button>
                    </Panel>
                </FormLayoutSidebar>
            </FormLayout>
            </PageContent>
        </Page>
    );
}

export const Route = createFileRoute('/_protected/users/new')({
	component: UserCreatePage,
});
