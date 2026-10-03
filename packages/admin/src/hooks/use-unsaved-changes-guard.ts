/**
 * Asks before unsaved changes are lost: an in-app navigation waits on the
 * admin's confirm dialog, and closing the tab on the browser's own prompt.
 */

import { useBlocker } from '@tanstack/react-router';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../components/ui/confirm';

/**
 * Guard a form while `isDirty()` holds. Returns `confirmDiscard`, for a switch
 * that drops the form without navigating (a locale held in state): it runs
 * `action` at once on a clean form, and only after the editor agrees otherwise.
 */
export function useUnsavedChangesGuard(isDirty: () => boolean): {
    confirmDiscard: (action: () => void) => void;
} {
    const confirm = useConfirm();
    const { t } = useTranslation();

    // Read through refs so the blocker registers once rather than every render.
    const isDirtyRef = useRef(isDirty);
    isDirtyRef.current = isDirty;
    const askRef = useRef(askToDiscard);
    askRef.current = askToDiscard;

    /** Open the confirm dialog; resolves true when the editor discards. */
    function askToDiscard(): Promise<boolean> {
        return new Promise((resolve) => {
            confirm({
                title: t('common.discardChangesTitle'),
                description: t('common.discardChangesMessage'),
                variant: 'danger',
                confirmLabel: t('common.discardChanges'),
                cancelLabel: t('common.keepEditing'),
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false),
            });
        });
    }

    const shouldBlockFn = useCallback(async (): Promise<boolean> => {
        if (!isDirtyRef.current()) return false;
        return !(await askRef.current());
    }, []);

    // The tab-close prompt below reads the form itself, so the router's own is off.
    useBlocker({ shouldBlockFn, enableBeforeUnload: false });

    useEffect(() => {
        function handleBeforeUnload(event: BeforeUnloadEvent): void {
            if (!isDirtyRef.current()) return;
            event.preventDefault();
        }
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    function confirmDiscard(action: () => void): void {
        if (!isDirtyRef.current()) {
            action();
            return;
        }
        void askToDiscard().then((discard) => {
            if (discard) action();
        });
    }

    return { confirmDiscard };
}
