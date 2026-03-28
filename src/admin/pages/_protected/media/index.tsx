import React, { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, LayoutList, Trash2 } from 'lucide-react';
import {
    Checkbox,
    ContentGrid,
    Dropdown,
    DropZone,
    EmptyState,
    Page,
    PageContent,
    PageHeader,
    PageLoading,
    PageTitle,
    Pagination,
    SearchInput,
    Select,
    Table,
    Toolbar,
    ToolbarStart,
    ToolbarEnd,
    ToggleGroup,
    UploadButton,
    UploadZone,
    useConfirm,
} from '@/admin/components/ui/index.js';
import { MediaCard } from '@/admin/components/media/MediaCard.js';
import { MediaRow } from '@/admin/components/media/MediaRow.js';
import { MediaDetailModal } from '@/admin/components/media/MediaDetailModal.js';
import { useViewMode } from '@/admin/hooks/use-view-mode.js';
import { useQueryState } from '@/admin/hooks/use-query-state.js';
import { useSelection } from '@/admin/hooks/use-selection.js';
import { useUploadMedia, usePermissions, useMediaQuery, useBulkDeleteMedia } from '@/admin/hooks/index.js';
import { TYPE_FILTER_OPTIONS, MEDIA_ACCEPT } from '@/admin/types/media.js';
import type { TypeFilter } from '@/admin/types/media.js';

const PER_PAGE = 20;

function MediaIndexPage(): React.ReactElement {
    const { t } = useTranslation();
    const confirm = useConfirm();

    const [q, setQ] = useQueryState('q', '');
    const [typeFilter, setTypeFilter] = useQueryState<TypeFilter>('type', 'all');
    const [page, setPage] = useQueryState('page', '1');
    const [viewMode, setViewMode] = useViewMode('media');
    const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

    const { canUploadMedia, canDeleteMedia } = usePermissions();

    const { upload, isUploading } = useUploadMedia();

    const currentPage = Math.max(1, Number(page) || 1);
    const queryParams = {
        ...(q ? { search: q } : {}),
        ...(typeFilter !== 'all' ? { where: { mimeType: typeFilter } } : {}),
        page: currentPage,
        limit: PER_PAGE,
    };

    const { data, isLoading } = useMediaQuery(queryParams);

    const items = data?.data ?? [];
    const totalPages = Math.max(1, data?.pagination?.pages ?? 1);

    const { checkedIds, toggle, toggleAll, allChecked, someChecked, reset } =
        useSelection(items);

    const bulkDeleteMutation = useBulkDeleteMedia({ onSuccess: reset });

    const isEmpty = items.length === 0;

    return (
        <>
            <Page>
                <PageHeader>
                    <PageTitle>{t('media.title')}</PageTitle>
                    {canUploadMedia() && (
                        <UploadButton
                            multiple
                            disabled={isUploading}
                            loading={isUploading}
                            onUpload={upload}
                        />
                    )}
                </PageHeader>

                <PageContent>
                    <Toolbar>
                        <ToolbarStart>
                            {someChecked && canDeleteMedia() && (
                                <Dropdown
                                    label={`${t('media.bulkActions')} (${checkedIds.size})`}
                                    variant="secondary"
                                    align="start"
                                    items={[
                                        {
                                            label: t('media.bulkDeleteButton'),
                                            icon: <Trash2 size={14} />,
                                            variant: 'danger',
                                            onClick: () => {
                                                const ids = Array.from(checkedIds);
                                                confirm({
                                                    title: t('media.bulkDeleteTitle', {
                                                        count: ids.length,
                                                    }),
                                                    description: t(
                                                        'media.bulkDeleteDescription'
                                                    ),
                                                    confirmLabel: t('common.delete'),
                                                    onConfirm: () =>
                                                        bulkDeleteMutation.mutate(ids),
                                                });
                                            },
                                        },
                                    ]}
                                />
                            )}
                            <SearchInput
                                placeholder={t('media.searchPlaceholder')}
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                            />
                            <Select
                                value={typeFilter}
                                onValueChange={(v) => {
                                    setTypeFilter((v ?? 'all') as TypeFilter);
                                    setPage('1');
                                }}
                                options={TYPE_FILTER_OPTIONS}
                                triggerPrefix={t('media.typeFilterPrefix')}
                                className="am-select-trigger-auto"
                            />
                        </ToolbarStart>

                        <ToolbarEnd>
                            <ToggleGroup
                                value={viewMode}
                                onValueChange={setViewMode}
                                items={[
                                    {
                                        value: 'grid',
                                        icon: <LayoutGrid size={15} />,
                                        label: t('common.gridView'),
                                    },
                                    {
                                        value: 'list',
                                        icon: <LayoutList size={15} />,
                                        label: t('common.listView'),
                                    },
                                ]}
                            />
                        </ToolbarEnd>
                    </Toolbar>

                    {isLoading ? (
                        <PageLoading />
                    ) : (
                        <DropZone
                            onUpload={upload}
                            accept={MEDIA_ACCEPT}
                            multiple
                            disabled={isUploading || !canUploadMedia()}
                        >
                            {isEmpty ? (
                                q || typeFilter !== 'all' ? (
                                    <EmptyState
                                        title={t('media.noResults')}
                                        description={
                                            q
                                                ? t('media.noSearchResults', { query: q })
                                                : t('media.noTypeResults', {
                                                      type: t(
                                                          `media.filter${typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)}`
                                                      ),
                                                  }).toLowerCase()
                                        }
                                    />
                                ) : canUploadMedia() ? (
                                    <UploadZone
                                        className="am-media-upload-zone-wrap"
                                        onUpload={upload}
                                        disabled={isUploading}
                                        label={t('media.uploadLabel')}
                                    />
                                ) : (
                                    <EmptyState title={t('media.noResults')} />
                                )
                            ) : (
                                <>
                                    {viewMode === 'grid' && (
                                        <div className="am-media-select-bar">
                                            <Checkbox
                                                checked={allChecked}
                                                onChange={toggleAll}
                                                label={t('common.selectAll')}
                                            />
                                        </div>
                                    )}

                                    {viewMode === 'grid' ? (
                                        <ContentGrid.Root>
                                            {items.map((item) => (
                                                <MediaCard
                                                    key={item.id}
                                                    item={item}
                                                    checked={checkedIds.has(item.id)}
                                                    onToggleCheck={toggle}
                                                    onClick={setSelectedMediaId}
                                                />
                                            ))}
                                        </ContentGrid.Root>
                                    ) : (
                                        <Table.Root>
                                            <Table.Head>
                                                <Table.Row>
                                                    <Table.Th className="am-table-checkbox-col">
                                                        <Checkbox
                                                            checked={allChecked}
                                                            onChange={toggleAll}
                                                        />
                                                    </Table.Th>
                                                    <Table.Th>File</Table.Th>
                                                    <Table.Th>Type</Table.Th>
                                                    <Table.Th>Size</Table.Th>
                                                    <Table.Th>Uploaded</Table.Th>
                                                </Table.Row>
                                            </Table.Head>
                                            <Table.Body>
                                                {items.map((item) => (
                                                    <MediaRow
                                                        key={item.id}
                                                        item={item}
                                                        checked={checkedIds.has(item.id)}
                                                        onToggleCheck={toggle}
                                                        onClick={setSelectedMediaId}
                                                    />
                                                ))}
                                            </Table.Body>
                                        </Table.Root>
                                    )}

                                    <Pagination
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        onPage={(p) => setPage(String(p))}
                                    />
                                </>
                            )}
                        </DropZone>
                    )}
                </PageContent>
            </Page>

            <MediaDetailModal
                mediaId={selectedMediaId}
                onClose={() => setSelectedMediaId(null)}
                onDeleted={() => {
                    setSelectedMediaId(null);
                }}
                canDelete={canDeleteMedia()}
                canUpload={canUploadMedia()}
            />
        </>
    );
}

export const Route = createFileRoute('/_protected/media/')({
	component: MediaIndexPage,
});
