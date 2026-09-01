/**
 * Confirmation modal for trashing or permanently deleting an entry. Trash and
 * delete are resource-level, so every locale of the entry goes with it; the
 * modal says so when there is more than one, and lists incoming relationships.
 */

import type { Entry, IncomingRelationship } from '@/types/index';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/admin/components/ui/button';
import { Modal } from '@/admin/components/ui/modal';
import { Spinner } from '@/admin/components/ui/spinner';
import { useIncomingRelationships } from '@/admin/hooks/entries';

type DeleteEntryModalProps = {
    open: boolean;
    entry: Entry | null;
    /** Display label for the entry type (singular). */
    typeLabel: string;
    /**
     * Permanent delete vs trash. Trash is reversible (no cascade-delete of versions),
     * permanent delete also drops versions + relationships.
     */
    force: boolean;
    onCancel: () => void;
    onConfirm: () => void;
    loading?: boolean;
};

export function DeleteEntryModal({
    open,
    entry,
    typeLabel,
    force,
    onCancel,
    onConfirm,
    loading = false,
}: DeleteEntryModalProps): React.ReactElement | null {
    const { t } = useTranslation();

    const localeCount = entry?.locales.length ?? 0;

    const { data: incoming, isLoading: incomingLoading } = useIncomingRelationships(
        entry?.type ?? '',
        entry?.id ?? '',
        open && entry != null
    );
    const incomingCount = incoming?.length ?? 0;

    if (entry == null) return null;

    return (
        <Modal
            open={open}
            onClose={onCancel}
            title={
                force
                    ? t('entries.confirmForceDeleteTitle')
                    : t('entries.confirmDeleteTitle')
            }
            footer={
                <>
                    <Button variant="secondary" onClick={onCancel} disabled={loading}>
                        {t('common.cancel')}
                    </Button>
                    <Button variant="danger" onClick={onConfirm} loading={loading}>
                        {force
                            ? t('entries.confirmForceDeleteLabel')
                            : t('entries.confirmDeleteLabel')}
                    </Button>
                </>
            }
        >
            <p>
                {force
                    ? t('entries.confirmForceDeleteMessage')
                    : t('entries.confirmDeleteMessage', {
                          name: typeLabel.toLowerCase(),
                      })}
            </p>
            <p>
                {entry.title ? (
                    <strong>{entry.title}</strong>
                ) : (
                    <strong className="am-text-mono">{entry.id}</strong>
                )}{' '}
                {entry.locale && (
                    <span className="am-text-muted am-text-sm">
                        ({entry.locale.toUpperCase()})
                    </span>
                )}
            </p>

            {localeCount > 1 && (
                <p className="am-text-sm am-text-muted">
                    {t('entries.deletesAllLocales', { count: localeCount })}
                </p>
            )}

            {open && (incomingLoading || incomingCount > 0) && (
                <div style={{ marginTop: '1rem' }}>
                    {incomingLoading ? (
                        <Spinner />
                    ) : (
                        <>
                            <p className="am-text-sm">
                                {t('entries.incomingRelationshipsHeader', {
                                    count: incomingCount,
                                })}
                            </p>
                            <ul
                                className="am-text-sm am-text-muted"
                                style={{ paddingLeft: '1.25rem' }}
                            >
                                {(incoming ?? [])
                                    .slice(0, 10)
                                    .map((r: IncomingRelationship) => (
                                        <li key={`${r.sourceId}-${r.schemaPath}`}>
                                            {r.sourceTitle || r.sourceId}{' '}
                                            <span className="am-text-mono">
                                                ({r.sourceType}.{r.schemaPath})
                                            </span>
                                        </li>
                                    ))}
                                {incomingCount > 10 && (
                                    <li>… +{incomingCount - 10} more</li>
                                )}
                            </ul>
                        </>
                    )}
                </div>
            )}
        </Modal>
    );
}
