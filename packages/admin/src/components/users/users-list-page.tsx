/**
 * The users list: a `DataList` of users with avatar, name, email and joined
 * date. Search, sort and page live in the URL; each row links to the user
 * and offers edit and delete.
 */

import type { DataListColumn } from '../ui/data-list';
import type { User } from 'astromech';
import { useNavigate } from '@tanstack/react-router';
import { Pencil, Trash2 } from 'lucide-react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiContext } from '../../context/ai-context';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { usePermissions } from '../../hooks/use-permissions';
import { userMutations, useUsersQuery } from '../../hooks/users';
import { formatDate } from '../../utilities/dates';
import { Avatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { useConfirm } from '../ui/confirm';
import { DataList } from '../ui/data-list';
import { EmptyState } from '../ui/empty-state';
import { Page, PageContent, PageHeader, PageTitle } from '../ui/page';
import { useListState } from '../ui/use-list-state';

const PER_PAGE = 20;

export function UsersListPage(): React.ReactElement {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const { canReadUsers, canCreateUsers, canDeleteUsers } = usePermissions();
    const list = useListState({ pageSize: PER_PAGE });

    useAiContext({ kind: 'users', label: t('users.title') }, { depth: 0 });

    useEffect(() => {
        if (!canReadUsers()) {
            void navigate({ to: '/' });
        }
    }, []);

    const {
        data: usersResult,
        isLoading,
        isError,
    } = useUsersQuery({
        ...(list.q ? { search: list.q } : {}),
        ...(list.sort ? { sort: { [list.sort.key]: list.sort.direction } } : {}),
        page: list.page,
        limit: list.limit,
    });
    const deleteMutation = useAdminMutation(userMutations().delete);

    const columns: DataListColumn<User>[] = [
        {
            key: 'avatar',
            label: '',
            className: 'am-table-icon',
            render: (user) => <Avatar name={user.name} src={user.image} size="sm" />,
        },
        {
            key: 'name',
            label: t('users.columnName'),
            sortable: true,
            link: true,
            render: (user) => user.name,
        },
        {
            key: 'email',
            label: t('users.columnEmail'),
            sortable: true,
            render: (user) => <span className="am-text-muted">{user.email}</span>,
        },
        {
            key: 'createdAt',
            label: t('users.columnJoined'),
            render: (user) => (
                <span className="am-text-sm am-text-muted">
                    {formatDate(user.createdAt)}
                </span>
            ),
        },
    ];

    function handleDelete(user: User): void {
        confirm({
            title: t('users.confirmDeleteTitle'),
            description: t('users.confirmDeleteMessage', { name: user.name }),
            confirmLabel: t('common.delete'),
            onConfirm: () => deleteMutation.mutate(user.id),
        });
    }

    return (
        <Page>
            <PageHeader>
                <PageTitle>{t('users.title')}</PageTitle>
                {canCreateUsers() && (
                    <Button
                        variant="secondary"
                        onClick={() => void navigate({ to: '/users/new' })}
                    >
                        {t('users.createUser')}
                    </Button>
                )}
            </PageHeader>

            <PageContent>
                <DataList
                    rows={usersResult?.data ?? []}
                    columns={columns}
                    isLoading={isLoading}
                    isError={isError}
                    search={list.q}
                    onSearch={list.setQuery}
                    searchPlaceholder={t('users.searchPlaceholder')}
                    sort={list.sort}
                    onSort={list.setSort}
                    page={list.page}
                    pages={Math.max(1, usersResult?.pagination?.pages ?? 1)}
                    {...(usersResult?.pagination != null
                        ? { total: usersResult.pagination.total }
                        : {})}
                    onPage={list.setPage}
                    rowHref={(user) => `/users/${user.id}`}
                    rowActions={(user) => [
                        {
                            label: t('common.edit'),
                            href: `/users/${user.id}`,
                            icon: <Pencil size={14} />,
                        },
                        ...(canDeleteUsers()
                            ? [
                                  {
                                      label: t('common.delete'),
                                      variant: 'danger' as const,
                                      onClick: () => handleDelete(user),
                                      icon: <Trash2 size={14} />,
                                  },
                              ]
                            : []),
                    ]}
                    empty={
                        <EmptyState
                            title={t('users.empty')}
                            description={t('users.emptyDescription')}
                        />
                    }
                />
            </PageContent>
        </Page>
    );
}
