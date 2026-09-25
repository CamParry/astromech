/**
 * Entry edit page for one entry type id, the site's or a plugin's: the header
 * actions, the staging banners and the two-column form over `useEditController`.
 */

import type { UseAdminEntryTypeResult } from '../../hooks/use-admin-entry-type';
import type { Entry } from 'astromech';
import { Menu } from '@base-ui/react/menu';
import { useNavigate } from '@tanstack/react-router';
import { resolveEntryUrl } from 'astromech/shared';
import { Copy, ExternalLink, Eye, MoreHorizontal, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { useAiContext } from '../../context/ai-context';
import { authorName, useAuthorNames } from '../../hooks/author-names';
import { entryMutations } from '../../hooks/entries';
import { useAdminEntryType } from '../../hooks/use-admin-entry-type';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { entryEditResource, useEditController } from '../../hooks/use-edit-controller';
import { EntryNamespaceProvider } from '../../i18n/entry-namespace';
import { resolveForm } from '../../rendering/resolve';
import { defaultContentLocale } from '../../utilities/content-locale';
import { formatDatetime } from '../../utilities/dates';
import { entryEditPath, entryTypeBasePath } from '../../utilities/entry-admin-path';
import { FieldColumn, FieldsForm } from '../forms/fields-form';
import { NotFoundPage } from '../layout/not-found-page';
import { LocaleSwitcher } from '../translations/locale-switcher';
import { Breadcrumb } from '../ui/breadcrumb';
import { Button } from '../ui/button';
import {
    Page,
    PageContent,
    PageHeader,
    PageHeaderActions,
    PageLoading,
    PageTitle,
} from '../ui/page';
import { StatusBadge } from '../ui/status-badge';
import { Tooltip } from '../ui/tooltip';
import { DeleteEntryModal } from './delete-entry-modal';
import { SlugField, StatusField, TitleField } from './entry-form-fields';
import { entryLabel } from './entry-label';
import { EditActions, EditBanners, VersionsLink } from './staging-controls';

type EntryEditPageProps = {
    /** Entry type id: `post`, or `forms/form` for a plugin's. */
    type: string;
    id: string;
    /** Locale from the route search params; defaults to the default content locale. */
    locale: string | undefined;
    /** Edit the staged change for that locale rather than the canonical row. */
    staged?: boolean | undefined;
};

/**
 * Keyed by the row in view: duplicate navigates to a different id, and the
 * locale switcher and staging to a different row of the same id, all on the
 * same route. Without the key TanStack Form and the stateful field containers
 * (repeater, blocks, tree) would keep the last row's state.
 */
export function EntryEditPage({
    type,
    id,
    locale,
    staged = false,
}: EntryEditPageProps): React.ReactElement {
    const entryType = useAdminEntryType(type);
    const resolvedLocale = locale ?? defaultContentLocale();
    if (entryType === null) return <NotFoundPage path={entryTypeBasePath(type)} />;
    return (
        <EntryEditBody
            key={`${id}:${resolvedLocale}:${String(staged)}`}
            entryType={entryType}
            id={id}
            locale={resolvedLocale}
            staged={staged}
        />
    );
}

function EntryEditBody({
    entryType,
    id,
    locale,
    staged,
}: {
    entryType: UseAdminEntryTypeResult;
    id: string;
    locale: string;
    staged: boolean;
}): React.ReactElement {
    const { type, config, basePath, namespace } = entryType;
    const { t } = useTranslation();
    const navigate = useNavigate();
    const authorNames = useAuthorNames();
    const [deleteOpen, setDeleteOpen] = React.useState(false);

    const controller = useEditController(entryEditResource(entryType, id, locale), {
        staged,
    });
    const { record: entry, form, isStaged, isReadOnly } = controller;
    const { hasTitle, hasSlug, hasStatuses, main, sidebar } = resolveForm(config);
    const { capabilities } = config;

    // `null` until the row loads, so no placeholder label is ever declared.
    useAiContext(
        entry !== null
            ? { kind: 'entries', type, id, label: entryLabel(entry, config) }
            : null,
        { depth: 1 }
    );

    const mutations = entryMutations(type, config.single);
    const trashEntry = useAdminMutation(mutations.trash, {
        onSuccess: () => void navigate({ to: basePath }),
    });
    const duplicateEntry = useAdminMutation(mutations.duplicate, {
        onSuccess: (copy) =>
            void navigate({
                to: entryEditPath(basePath, copy.id, { locale: copy.locale }),
            }),
    });
    const issueToken = useAdminMutation(mutations.issuePreviewToken);
    const revokeToken = useAdminMutation(mutations.revokePreviewToken);

    const previewUrl =
        config.url !== null && entry !== null ? resolveEntryUrl(config.url, entry) : null;
    // One surface control: a published entry links to its live page; anything
    // else opens a tokenised preview of the last saved state.
    const showViewLive =
        !isStaged && previewUrl !== null && entry?.status === 'published';
    const showPreview = capabilities.staging && previewUrl !== null && !showViewLive;
    const previewLabel = isStaged ? t('staging.previewStaged') : t('staging.preview');

    function handlePreview(): void {
        if (previewUrl === null) return;
        issueToken.mutate(id, {
            onSuccess: ({ token }) => {
                const url = `${previewUrl}?preview=${encodeURIComponent(token)}${
                    isStaged ? '&staged=1' : ''
                }`;
                window.open(url, '_blank', 'noopener');
            },
        });
    }

    if (controller.isLoading) return <PageLoading />;

    return (
        <EntryNamespaceProvider namespace={namespace}>
            <Page>
                <DeleteEntryModal
                    open={deleteOpen}
                    entry={entry}
                    typeLabel={config.single}
                    force={false}
                    onCancel={() => setDeleteOpen(false)}
                    onConfirm={() => trashEntry.mutate(id)}
                    loading={trashEntry.isPending}
                />
                <PageHeader>
                    <PageTitle>
                        <Breadcrumb
                            items={[
                                { label: config.plural, to: basePath },
                                {
                                    label: t('entries.editTitle', {
                                        title: hasTitle
                                            ? (entry?.title ?? config.single)
                                            : config.single,
                                    }),
                                },
                            ]}
                        />
                    </PageTitle>
                    <PageHeaderActions>
                        {!isReadOnly && controller.isDirty && (
                            <span className="am-form-layout-dirty-indicator">
                                {t('common.unsavedChanges')}
                            </span>
                        )}
                        {hasStatuses && !isStaged && entry !== null && (
                            <StatusBadge status={entry.status} />
                        )}
                        {!isStaged && capabilities.translatable && entry !== null && (
                            <LocaleSwitcher
                                id={id}
                                currentLocale={entry.locale}
                                type={type}
                                basePath={basePath}
                                locales={entry.locales}
                                allLocales={adminConfig.locales}
                                defaultLocale={defaultContentLocale()}
                                compact
                            />
                        )}
                        {showViewLive && (
                            <Tooltip content={t('entries.viewLive')}>
                                <a
                                    href={previewUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="am-btn am-btn-secondary am-btn-md am-btn-icon"
                                    aria-label={t('entries.viewLive')}
                                >
                                    <ExternalLink size={16} />
                                </a>
                            </Tooltip>
                        )}
                        {showPreview && (
                            <Tooltip content={previewLabel}>
                                <Button
                                    variant="secondary"
                                    aria-label={previewLabel}
                                    onClick={handlePreview}
                                    loading={issueToken.isPending}
                                    icon={<Eye size={16} />}
                                />
                            </Tooltip>
                        )}
                        <EditActions controller={controller} />
                        {!isReadOnly && !isStaged && (
                            <Menu.Root>
                                <Menu.Trigger
                                    className="am-btn am-btn-secondary am-btn-md am-btn-icon"
                                    aria-label={t('entries.moreActions')}
                                >
                                    <MoreHorizontal size={16} />
                                </Menu.Trigger>
                                <Menu.Portal>
                                    <Menu.Positioner
                                        className="am-topbar-menu-positioner"
                                        sideOffset={6}
                                        align="end"
                                    >
                                        <Menu.Popup className="am-topbar-menu-popup">
                                            <Menu.Item
                                                className="am-topbar-menu-item"
                                                onClick={() => duplicateEntry.mutate(id)}
                                                disabled={duplicateEntry.isPending}
                                            >
                                                <span className="am-topbar-menu-item-icon">
                                                    <Copy size={14} />
                                                </span>
                                                {t('common.duplicate')}
                                            </Menu.Item>
                                            {capabilities.staging && (
                                                <Menu.Item
                                                    className="am-topbar-menu-item"
                                                    onClick={() => revokeToken.mutate(id)}
                                                    disabled={revokeToken.isPending}
                                                >
                                                    <span className="am-topbar-menu-item-icon">
                                                        <Eye size={14} />
                                                    </span>
                                                    {t('staging.revokePreview')}
                                                </Menu.Item>
                                            )}
                                            <Menu.Separator className="am-topbar-menu-separator" />
                                            <Menu.Item
                                                className="am-topbar-menu-item am-topbar-menu-item-danger"
                                                onClick={() => setDeleteOpen(true)}
                                            >
                                                <span className="am-topbar-menu-item-icon">
                                                    <Trash2 size={14} />
                                                </span>
                                                {t('common.delete')}
                                            </Menu.Item>
                                        </Menu.Popup>
                                    </Menu.Positioner>
                                </Menu.Portal>
                            </Menu.Root>
                        )}
                    </PageHeaderActions>
                </PageHeader>

                {entry !== null && (
                    <p className="am-entry-meta">
                        {entryMetaLine(entry, authorNames, t)}
                    </p>
                )}

                <PageContent>
                    <EditBanners
                        controller={controller}
                        title={controller.canonical?.title ?? config.single}
                    />
                    <FieldsForm
                        form={controller}
                        main={
                            <>
                                {hasTitle && (
                                    <TitleField form={form} disabled={isReadOnly} />
                                )}
                                <FieldColumn form={controller} fields={main} />
                            </>
                        }
                        sidebar={
                            <>
                                {hasStatuses && !isStaged && (
                                    <StatusField
                                        form={form}
                                        savedPublishedAt={entry?.publishedAt}
                                        disabled={isReadOnly}
                                    />
                                )}
                                {hasSlug && (
                                    <SlugField form={form} disabled={isReadOnly} />
                                )}
                                <FieldColumn form={controller} fields={sidebar} />
                                {capabilities.versioning && !isStaged && (
                                    <VersionsLink controller={controller} />
                                )}
                            </>
                        }
                    />
                </PageContent>
            </Page>
        </EntryNamespaceProvider>
    );
}

/**
 * The edit page's one metadata line: when this locale was last written and by
 * whom, then when the entry was made and by whom. An author the current user
 * cannot resolve is left out rather than shown as a raw id.
 */
function entryMetaLine(
    entry: Entry,
    authorNames: Map<string, string>,
    t: ReturnType<typeof useTranslation>['t']
): string {
    const updatedName = authorName(entry.updatedBy, authorNames);
    const createdName = authorName(entry.createdBy, authorNames);
    const updated =
        updatedName !== undefined
            ? t('entries.updatedMeta', {
                  date: formatDatetime(entry.updatedAt),
                  name: updatedName,
              })
            : t('entries.updatedMetaNoAuthor', { date: formatDatetime(entry.updatedAt) });
    const created =
        createdName !== undefined
            ? t('entries.createdMeta', {
                  date: formatDatetime(entry.createdAt),
                  name: createdName,
              })
            : t('entries.createdMetaNoAuthor', { date: formatDatetime(entry.createdAt) });

    return `${updated} · ${created}`;
}
