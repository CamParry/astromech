import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './button.js';

export type PaginationProps = {
    currentPage: number;
    totalPages: number;
    onPage: (page: number) => void;
    totalItems?: number;
};

export function Pagination({ currentPage, totalPages, onPage, totalItems }: PaginationProps): React.ReactElement | null {
    const { t } = useTranslation();

    if (totalPages <= 1) return null;

    return (
        <div className="am-pagination">
            {totalItems != null && (
                <span className="am-pagination-total">{t('common.total', { count: totalItems })}</span>
            )}
            <Button
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => onPage(currentPage - 1)}
            >
                {t('common.previous')}
            </Button>
            <span className="am-pagination-info">
                {t('common.page', { page: currentPage, total: totalPages })}
            </span>
            <Button
                variant="secondary"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => onPage(currentPage + 1)}
            >
                {t('common.next')}
            </Button>
        </div>
    );
}
