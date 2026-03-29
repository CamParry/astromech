/**
 * User edit page.
 *
 * Form with name field (editable) and email field (read-only).
 * Metadata sidebar shows joined date and last updated.
 */

import React, { useEffect } from 'react';
import { createFileRoute, useParams, useNavigate } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import {
    Button,
    Panel,
    Breadcrumb,
    Input,
    Select,
    Avatar,
    PageLoading,
    useConfirm,
    Page,
    PageHeader,
    PageTitle,
    PageContent,
    FormLayout,
    FormLayoutMain,
    FormLayoutSidebar,
} from '@/admin/components/ui/index.js';
import {
    usePermissions,
    useUser,
    useUpdateUser,
    useDeleteUser,
} from '@/admin/hooks/index.js';
import { useAuth } from '@/admin/context/auth.js';
import adminConfig from 'virtual:astromech/admin-config';

// ============================================================================
// Helpers
// ============================================================================

function formatDate(value: Date | string | null | undefined): string {
    if (value == null) return '—';
    return new Date(value).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// ============================================================================
// Types
// ============================================================================

type FormValues = {
    name: string;
    roleSlug: string;
};

// ============================================================================
// Page
// ============================================================================

function UserEditPage(): React.ReactElement {
    const { id } = useParams({ strict: false }) as { id: string };
    const confirm = useConfirm();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
    const { canReadUsers, canUpdateUsers, canDeleteUsers } = usePermissions();

    const isSelf = currentUser?.id === id;

    const { data: user, isLoading } = useUser(id);

    const form = useForm({
        defaultValues: {
            name: user?.name ?? '',
            roleSlug: user?.roleSlug ?? '',
        } satisfies FormValues,
        onSubmit: ({ value }) => {
            const payload: Partial<{ name: string; roleSlug: string }> = {
                name: value.name,
            };
            if (canUpdateUsers() && !isSelf) {
                payload.roleSlug = value.roleSlug;
            }
            updateMutation.mutate(payload);
        },
    });

    useEffect(() => {
        if (!canReadUsers() && !isSelf) {
            void navigate({ to: '/' });
        }
    }, []);

    const updateMutation = useUpdateUser(id, {
        onFormReset: () => form.reset(form.state.values),
    });

    const deleteMutation = useDeleteUser({
        id,
        onSuccess: () => void navigate({ to: '/users' }),
    });

    const canSave = canUpdateUsers() || isSelf;

    function handleSave() {
        void form.handleSubmit();
    }

    if (isLoading) {
        return <PageLoading />;
    }

    return (
        <Page>
            <PageHeader>
                <PageTitle>{user?.name ?? t('users.editUser')}</PageTitle>
                <Breadcrumb
                    items={[
                        { label: t('users.title'), to: '/users' },
                        { label: user?.name ?? t('users.editUser') },
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
                                        value={user?.email ?? ''}
                                        readOnly
                                        disabled
                                        hint={t('users.emailReadonly')}
                                    />
                                </div>

                                {canUpdateUsers() && !isSelf && (
                                    <form.Field name="roleSlug">
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
                                )}
                            </div>
                        </Panel>
                    </FormLayoutMain>

                    {/* Sidebar column */}
                    <FormLayoutSidebar>
                        <Panel title={t('users.actionsPanel')}>
                            {canSave && (
                                <Button
                                    onClick={handleSave}
                                    loading={updateMutation.isPending}
                                    disabled={
                                        !form.state.isDirty || form.state.isSubmitting
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
                                            title: t('users.confirmDeleteTitle'),
                                            description: t('users.confirmDeleteMessage', {
                                                name: user?.name ?? '',
                                            }),
                                            confirmLabel: t('common.delete'),
                                            onConfirm: () =>
                                                deleteMutation.mutate(undefined),
                                        })
                                    }
                                    loading={deleteMutation.isPending}
                                    style={{ marginTop: canSave ? '0.5rem' : undefined }}
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
                                {user != null && (
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
                                )}

                                <dl className="am-meta">
                                    <div>
                                        <dt className="am-meta-label">
                                            {t('users.joinedLabel')}
                                        </dt>
                                        <dd className="am-meta-value">
                                            {formatDate(user?.createdAt)}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="am-meta-label">
                                            {t('users.lastUpdatedLabel')}
                                        </dt>
                                        <dd className="am-meta-value">
                                            {formatDate(user?.updatedAt)}
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                        </Panel>
                    </FormLayoutSidebar>
                </FormLayout>
            </PageContent>
        </Page>
    );
}

export const Route = createFileRoute('/_protected/users/$id')({
    component: UserEditPage,
});
