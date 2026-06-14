/**
 * DeleteEntryModal — confirmation modal for trashing or permanently deleting
 * an entry. Surfaces:
 *  - cascade-locales toggle (only when the entry has sibling locales)
 *  - incoming-relations list (only when other entries reference this one)
 *
 * See specs/symmetric-locale-model.md §9 (delete confirmation modal).
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Modal, Spinner } from '@/admin/components/ui/index.js';
import { useIncomingRelations } from '@/admin/hooks/entries.js';
import type { Entry, IncomingRelation } from '@/types/index.js';

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
    onConfirm: (options: { cascadeLocales: boolean }) => void;
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
    const [cascadeLocales, setCascadeLocales] = useState(false);

    // Reset checkbox each time the modal opens for a different entry.
    React.useEffect(() => {
        if (open) setCascadeLocales(false);
    }, [open, entry?.id]);

    const localeSiblings =
        entry != null
            ? Object.entries(entry.locales ?? {}).filter(([, id]) => id !== entry.id)
            : [];
    const hasSiblings = localeSiblings.length > 0;

    const { data: incoming, isLoading: incomingLoading } = useIncomingRelations(
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
                    <Button
                        variant="danger"
                        onClick={() => onConfirm({ cascadeLocales })}
                        loading={loading}
                    >
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

            {hasSiblings && (
                <div className="am-field" style={{ marginTop: '1rem' }}>
                    <Checkbox
                        checked={cascadeLocales}
                        onChange={() => setCascadeLocales((v) => !v)}
                        label={t('entries.cascadeLocalesLabel', {
                            count: localeSiblings.length,
                        })}
                    />
                </div>
            )}

            {open && (incomingLoading || incomingCount > 0) && (
                <div style={{ marginTop: '1rem' }}>
                    {incomingLoading ? (
                        <Spinner />
                    ) : (
                        <>
                            <p className="am-text-sm">
                                {t('entries.incomingRelationsHeader', {
                                    count: incomingCount,
                                })}
                            </p>
                            <ul
                                className="am-text-sm am-text-muted"
                                style={{ paddingLeft: '1.25rem' }}
                            >
                                {(incoming ?? [])
                                    .slice(0, 10)
                                    .map((r: IncomingRelation) => (
                                        <li key={`${r.sourceId}-${r.name}`}>
                                            {r.sourceTitle || r.sourceId}{' '}
                                            <span className="am-text-mono">
                                                ({r.sourceType}.{r.name})
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
