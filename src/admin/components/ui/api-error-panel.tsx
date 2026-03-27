/**
 * ApiErrorPanel — global 5xx error display.
 *
 * Listens for `astromech:api-error` custom DOM events emitted by apiFetch.
 * - 5xx errors: dismissible modal with full message, error code badge, and ref.
 * - 4xx / unknown: not handled here; individual mutation onError handlers show toasts.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AstromechApiError } from '../../../sdk/fetch/index.js';
import { Badge } from './badge.js';
import { Button } from './button.js';
import { Modal } from './modal.js';

// ============================================================================
// Types
// ============================================================================

type ApiErrorDetail = {
    id: string;
    code: string;
    message: string;
    status: number;
};

// ============================================================================
// Custom event helpers
// ============================================================================

export type ApiErrorEventDetail =
    | { type: 'api'; error: AstromechApiError }
    | { type: 'unknown'; message: string };

const EVENT_NAME = 'astromech:api-error';

export function dispatchApiErrorEvent(detail: ApiErrorEventDetail): void {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

// ============================================================================
// Component
// ============================================================================

export function ApiErrorPanel(): React.ReactElement {
    const { t } = useTranslation();
    const [serverError, setServerError] = useState<ApiErrorDetail | null>(null);

    const handleEvent = useCallback(
        (e: Event) => {
            const detail = (e as CustomEvent<ApiErrorEventDetail>).detail;

            if (detail.type === 'api' && detail.error.status >= 500) {
                const err = detail.error;
                setServerError({
                    id: err.id,
                    code: err.code,
                    message: err.message,
                    status: err.status,
                });
            }
            // 4xx and unknown errors are handled by individual mutation onError handlers
        },
        [],
    );

    useEffect(() => {
        window.addEventListener(EVENT_NAME, handleEvent);
        return () => window.removeEventListener(EVENT_NAME, handleEvent);
    }, [handleEvent]);

    return (
        <Modal
            open={serverError !== null}
            onClose={() => setServerError(null)}
            title={t('apiError.serverError')}
            size="md"
            footer={
                <Button variant="secondary" onClick={() => setServerError(null)}>
                    {t('common.dismiss')}
                </Button>
            }
        >
            {serverError !== null && (
                <div className="am-api-error">
                    <div className="am-api-error__badge-row">
                        <Badge variant="danger">{serverError.code}</Badge>
                    </div>
                    <p className="am-api-error__message">{serverError.message}</p>
                    <p className="am-api-error__ref">{t('apiError.ref', { id: serverError.id })}</p>
                </div>
            )}
        </Modal>
    );
}
