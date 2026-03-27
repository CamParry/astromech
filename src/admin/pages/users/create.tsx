/**
 * User create page.
 *
 * Form with name, email, and role fields.
 * Guarded: redirects to dashboard if the current user lacks users:create permission.
 */

import React, { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import {
    Button,
    Panel,
    Breadcrumb,
    Input,
    Select,
    useToast,
    Page,
    FormLayout,
    FormLayoutMain,
    FormLayoutSidebar,
} from '../../components/ui/index.js';
import { Astromech } from '../../../sdk/client/index.js';
import { queryKeys } from '../../hooks/use-query-keys.js';
import { usePermissions } from '../../hooks/index.js';
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

export function UserCreatePage(): React.ReactElement {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { canCreateUsers } = usePermissions();

    useEffect(() => {
        if (!canCreateUsers()) {
            void navigate({ to: '/' });
        }
    }, []);

    const defaultRole = adminConfig.roles[0]?.slug ?? '';

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

    const createMutation = useMutation({
        mutationFn: (data: { name: string; email: string; roleSlug: string }) =>
            Astromech.users.create(data),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
            toast({ message: t('users.updated'), variant: 'success' });
            void navigate({ to: '/users' });
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('users.saveFailed'),
                variant: 'error',
            });
        },
    });

    function handleSave() {
        void form.handleSubmit();
    }

    return (
        <Page>
            <Breadcrumb
                items={[
                    { label: t('users.title'), to: '/users' },
                    { label: t('users.createTitle') },
                ]}
            />

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
        </Page>
    );
}
