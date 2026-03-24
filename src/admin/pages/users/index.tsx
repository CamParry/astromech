/**
 * Users list page.
 *
 * Shows a table of all users with avatar, name, email, and joined date.
 * Supports row-level edit and delete actions.
 */

import React from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
    Button,
    Spinner,
    EmptyState,
    Table,
    Toolbar,
    ToolbarLeft,
    ToolbarRight,
    Dropdown,
    Avatar,
    useToast,
    useConfirm,
    Page,
    PageHeader,
    PageTitle,
} from '../../components/ui/index.js';
import { Astromech } from '../../../sdk/client/index.js';
import { queryKeys } from '../../hooks/useQueryKeys.js';
import type { User } from '../../../types/index.js';
import { formatDate } from '@/support/dates.js';

// ============================================================================
// Helpers
// ============================================================================

// ============================================================================
// Page
// ============================================================================

export function UsersIndexPage(): React.ReactElement {
    const { t } = useTranslation();
    const { toast } = useToast();
    const confirm = useConfirm();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const { data: users, isLoading } = useQuery({
        queryKey: queryKeys.users.all(),
        queryFn: () => Astromech.users.all(),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) =>
            Astromech.users.delete(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
            toast({ message: t('users.deleted'), variant: 'success' });
        },
        onError: (err) => {
            toast({ message: err instanceof Error ? err.message : t('users.deleteFailed'), variant: 'error' });
        },
    });

    return (
        <Page>
                <PageHeader>
                    <PageTitle>{t('users.title')}</PageTitle>
                    <Button
                        variant="secondary"
                        onClick={() => toast({ message: t('users.comingSoon'), variant: 'info' })}
                    >
                        {t('users.inviteUser')}
                    </Button>
                </PageHeader>

                <Table.Root>
                    <Table.Head>
                        <Table.Row>
                            <Table.Th style={{ width: '3rem' }} />
                            <Table.Th>{t('users.columnName')}</Table.Th>
                            <Table.Th>{t('users.columnEmail')}</Table.Th>
                            <Table.Th>{t('users.columnJoined')}</Table.Th>
                            <Table.Th style={{ width: '3rem' }} />
                        </Table.Row>
                    </Table.Head>
                    <Table.Body>
                        {isLoading ? (
                            <Table.Empty colSpan={5}>
                                <Spinner />
                            </Table.Empty>
                        ) : !users || users.length === 0 ? (
                            <Table.Empty colSpan={5}>
                                <EmptyState
                                    title={t('users.empty')}
                                    description={t('users.emptyDescription')}
                                />
                            </Table.Empty>
                        ) : (
                            users.map((user) => (
                                <Table.Row
                                    key={user.id}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => void navigate({ to: '/users/$id', params: { id: user.id } })}
                                >
                                    <Table.Td>
                                        <Avatar
                                            name={user.name}
                                            src={user.image}
                                            size="sm"
                                        />
                                    </Table.Td>
                                    <Table.Td style={{ fontWeight: 500 }}>
                                        <Link
                                            to="/users/$id"
                                            params={{ id: user.id }}
                                            className="am-link"
                                        >
                                            {user.name}
                                        </Link>
                                    </Table.Td>
                                    <Table.Td className="am-text-muted">
                                        {user.email}
                                    </Table.Td>
                                    <Table.Td className="am-text-sm am-text-muted">
                                        {formatDate(user.createdAt)}
                                    </Table.Td>
                                    <Table.Td>
                                        <Dropdown
                                            icon={<MoreHorizontal size={16} />}
                                            ariaLabel={t('common.actions')}
                                            items={[
                                                {
                                                    label: t('common.edit'),
                                                    href: `/users/${user.id}`,
                                                    icon: <Pencil size={14} />,
                                                },
                                                {
                                                    label: t('common.delete'),
                                                    variant: 'danger' as const,
                                                    onClick: () => confirm({
                                                        title: t('users.confirmDeleteTitle'),
                                                        description: t('users.confirmDeleteMessage', { name: user.name }),
                                                        confirmLabel: t('common.delete'),
                                                        onConfirm: () => deleteMutation.mutate(user.id),
                                                    }),
                                                    icon: <Trash2 size={14} />,
                                                },
                                            ]}
                                        />
                                    </Table.Td>
                                </Table.Row>
                            ))
                        )}
                    </Table.Body>
                </Table.Root>
            </Page>
    );
}
