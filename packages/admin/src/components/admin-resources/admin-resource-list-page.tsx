/**
 * An admin resource's list: a `DataList` over the resource's list method, with
 * its search, sort and page in the URL. Create, open and delete appear only
 * when the resource declares the method behind them and the user may call it.
 */

import type { UseAdminResourceResult } from '../../hooks/use-admin-resource';
import type { DataListColumn } from '../ui/data-list';
import type { AdminResourceListInput, AdminResourceRow, DataField } from 'astromech';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { flattenFieldNodes } from 'astromech/shared';
import { Pencil, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    adminResourceListQueryOptions,
    adminResourceMutations,
} from '../../hooks/admin-resources';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { useLabel } from '../../i18n/entry-namespace';
import { Button } from '../ui/button';
import { useConfirm } from '../ui/confirm';
import { DataList } from '../ui/data-list';
import { EmptyState } from '../ui/empty-state';
import { Page, PageContent, PageHeader, PageTitle } from '../ui/page';
import { useListState } from '../ui/use-list-state';
import { AdminResourceGuard } from './admin-resource-guard';
import { AdminResourceValue } from './admin-resource-value';

const PER_PAGE = 20;

export type AdminResourceListPageProps = {
    /** The owning plugin's namespace. */
    plugin: string;
    name: string;
};

export function AdminResourceListPage({
    plugin,
    name,
}: AdminResourceListPageProps): React.ReactElement {
    return (
        <AdminResourceGuard plugin={plugin} name={name} method="list">
            {(target) => <AdminResourceList target={target} />}
        </AdminResourceGuard>
    );
}

function AdminResourceList({
    target,
}: {
    target: UseAdminResourceResult;
}): React.ReactElement {
    const { t } = useTranslation();
    const label = useLabel();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const list = useListState({ pageSize: PER_PAGE });
    const { resource, basePath, can } = target;

    const input: AdminResourceListInput = {
        ...(resource.search && list.q ? { search: list.q } : {}),
        ...(list.sort ? { sort: { [list.sort.key]: list.sort.direction } } : {}),
        page: list.page,
        limit: list.limit,
    };
    const {
        data: result,
        isLoading,
        isError,
    } = useQuery(adminResourceListQueryOptions(target, input));

    const mutations = adminResourceMutations(target);
    const deleteMutation = useAdminMutation(mutations.delete);
    const deleteManyMutation = useAdminMutation(mutations.deleteMany);

    const plural = label(resource.label, resource.name);
    const singular = label(resource.labelSingular, resource.name);
    const canOpen = can('get');
    const canDelete = can('delete');

    const fields = new Map<string, DataField>(
        flattenFieldNodes(resource.fields).map((field) => [field.name, field])
    );
    // Boot checks that every column names a field, so none is dropped here.
    const columns: DataListColumn<AdminResourceRow>[] = resource.columns.flatMap(
        (column, index) => {
            const field = fields.get(column.field);
            if (field === undefined) return [];
            return [
                {
                    key: field.name,
                    label: label(field.label, field.name),
                    sortable: column.sortable,
                    link: index === 0,
                    render: (row) => (
                        <AdminResourceValue field={field} value={row[field.name]} />
                    ),
                },
            ];
        }
    );

    function handleDelete(row: AdminResourceRow): void {
        confirm({
            title: t('adminResources.confirmDeleteTitle', { name: singular }),
            description: t('adminResources.confirmDeleteMessage'),
            confirmLabel: t('common.delete'),
            variant: 'danger',
            onConfirm: () => deleteMutation.mutate(row.id),
        });
    }

    function rowActions(row: AdminResourceRow) {
        return [
            ...(canOpen
                ? [
                      {
                          label: t('common.edit'),
                          href: `${basePath}/${row.id}`,
                          icon: <Pencil size={14} />,
                      },
                  ]
                : []),
            ...(canDelete
                ? [
                      {
                          label: t('common.delete'),
                          variant: 'danger' as const,
                          onClick: () => handleDelete(row),
                          icon: <Trash2 size={14} />,
                      },
                  ]
                : []),
        ];
    }

    return (
        <Page>
            <PageHeader>
                <PageTitle>{plural}</PageTitle>
                {can('create') && (
                    <Button
                        variant="secondary"
                        onClick={() => void navigate({ to: `${basePath}/new` })}
                    >
                        {t('adminResources.create', { name: singular })}
                    </Button>
                )}
            </PageHeader>

            <PageContent>
                <DataList
                    rows={result?.data ?? []}
                    columns={columns}
                    isLoading={isLoading}
                    isError={isError}
                    {...(resource.search
                        ? { search: list.q, onSearch: list.setQuery }
                        : {})}
                    sort={list.sort}
                    onSort={list.setSort}
                    page={list.page}
                    pages={Math.max(1, result?.pagination?.pages ?? 1)}
                    {...(result?.pagination != null
                        ? { total: result.pagination.total }
                        : {})}
                    onPage={list.setPage}
                    rowHref={canOpen ? (row) => `${basePath}/${row.id}` : () => undefined}
                    {...(canOpen || canDelete ? { rowActions } : {})}
                    bulkActions={
                        canDelete
                            ? [
                                  {
                                      label: t('common.delete'),
                                      tone: 'danger',
                                      icon: <Trash2 size={14} />,
                                      run: (ids) => deleteManyMutation.mutateAsync(ids),
                                  },
                              ]
                            : []
                    }
                    empty={
                        <EmptyState
                            title={t('adminResources.empty', {
                                name: plural.toLowerCase(),
                            })}
                        />
                    }
                />
            </PageContent>
        </Page>
    );
}
