/**
 * Users list page.
 *
 * Shows a table of all users with avatar, name, email, and joined date.
 * Search and page state are synced to the URL. Supports row-level edit and
 * delete actions.
 */

import React, { useEffect } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
    Button,
    Spinner,
    EmptyState,
    Table,
    Dropdown,
    Avatar,
    useConfirm,
    Page,
    PageHeader,
    PageTitle,
    PageContent,
    Toolbar,
    ToolbarStart,
    SearchInput,
    Pagination,
} from '@/admin/components/ui/index.js';
import { usePermissions, useUsersQuery, useDeleteUser } from '@/admin/hooks/index.js';
import { formatDate } from '@/utilities/dates.js';

const PER_PAGE = 20;

type UsersSearch = {
    q?: string;
    page?: number;
};

// ============================================================================
// Page
// ============================================================================

function UsersIndexPage(): React.ReactElement {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const navigate = Route.useNavigate();
    const { canReadUsers, canCreateUsers, canDeleteUsers } = usePermissions();

    const { q = '', page: pageParam = 1 } = Route.useSearch();

    useEffect(() => {
        if (!canReadUsers()) {
            void navigate({ to: '/' });
        }
    }, []);

    function setQ(value: string): void {
        void navigate({
            search: (prev) => {
                const next: UsersSearch = { ...prev };
                if (value) next.q = value;
                else delete next.q;
                // New query → back to the first page.
                delete next.page;
                return next;
            },
        });
    }
    function setPage(value: number): void {
        void navigate({
            search: (prev) => {
                const next: UsersSearch = { ...prev };
                if (value === 1) delete next.page;
                else next.page = value;
                return next;
            },
        });
    }

    const currentPage = Math.max(1, pageParam);
    const { data: usersResult, isLoading } = useUsersQuery({
        ...(q ? { search: q } : {}),
        page: currentPage,
        limit: PER_PAGE,
    });
    const users = usersResult?.data;
    const totalPages = Math.max(1, usersResult?.pagination?.pages ?? 1);
    const totalItems = usersResult?.pagination?.total;
    const deleteMutation = useDeleteUser();

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
                <Toolbar>
                    <ToolbarStart>
                        <SearchInput
                            placeholder={t('users.searchPlaceholder')}
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                        />
                    </ToolbarStart>
                </Toolbar>

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
                                    onClick={() =>
                                        void navigate({
                                            to: '/users/$id',
                                            params: { id: user.id },
                                        })
                                    }
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
                                                ...(canDeleteUsers()
                                                    ? [
                                                          {
                                                              label: t('common.delete'),
                                                              variant: 'danger' as const,
                                                              onClick: () =>
                                                                  confirm({
                                                                      title: t(
                                                                          'users.confirmDeleteTitle'
                                                                      ),
                                                                      description: t(
                                                                          'users.confirmDeleteMessage',
                                                                          {
                                                                              name: user.name,
                                                                          }
                                                                      ),
                                                                      confirmLabel:
                                                                          t(
                                                                              'common.delete'
                                                                          ),
                                                                      onConfirm: () =>
                                                                          deleteMutation.mutate(
                                                                              user.id
                                                                          ),
                                                                  }),
                                                              icon: <Trash2 size={14} />,
                                                          },
                                                      ]
                                                    : []),
                                            ]}
                                        />
                                    </Table.Td>
                                </Table.Row>
                            ))
                        )}
                    </Table.Body>
                </Table.Root>

                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPage={setPage}
                    {...(totalItems != null ? { totalItems } : {})}
                />
            </PageContent>
        </Page>
    );
}

export const Route = createFileRoute('/_protected/users/')({
    validateSearch: (search: Record<string, unknown>): UsersSearch => {
        const out: UsersSearch = {};
        if (typeof search['q'] === 'string' && search['q']) out.q = search['q'];
        const pageRaw = search['page'];
        const pageNum =
            typeof pageRaw === 'number'
                ? pageRaw
                : typeof pageRaw === 'string'
                  ? Number(pageRaw)
                  : NaN;
        if (Number.isFinite(pageNum) && pageNum > 1) out.page = pageNum;
        return out;
    },
    component: UsersIndexPage,
});
