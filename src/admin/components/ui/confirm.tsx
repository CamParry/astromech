import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Button } from './button.js';
import type { ButtonVariant } from './button.js';

type ConfirmOptions = {
    title: string;
    description?: string;
    variant?: ButtonVariant;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel?: () => void;
};

type ConfirmContextValue = (options: ConfirmOptions) => void;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }): React.ReactElement {
    const [state, setState] = useState<ConfirmOptions | null>(null);

    const confirm = useCallback((options: ConfirmOptions) => {
        setState(options);
    }, []);

    function handleConfirm() {
        state?.onConfirm();
        setState(null);
    }

    function handleCancel() {
        state?.onCancel?.();
        setState(null);
    }

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <AlertDialog.Root open={state !== null} onOpenChange={(open) => { if (!open) handleCancel(); }}>
                <AlertDialog.Portal>
                    <AlertDialog.Backdrop className="am-modal__backdrop" />
                    <AlertDialog.Popup className="am-modal__panel am-modal__panel--sm">
                        <div className="am-modal__header">
                            <AlertDialog.Title className="am-modal__title">
                                {state?.title ?? ''}
                            </AlertDialog.Title>
                        </div>
                        {state?.description !== undefined && (
                            <div className="am-modal__body">
                                <AlertDialog.Description>{state.description}</AlertDialog.Description>
                            </div>
                        )}
                        <div className="am-modal__footer">
                            <AlertDialog.Close
                                render={
                                    <Button variant="secondary" onClick={handleCancel}>
                                        {state?.cancelLabel ?? 'Cancel'}
                                    </Button>
                                }
                            />
                            <Button variant={state?.variant ?? 'danger'} onClick={handleConfirm}>
                                {state?.confirmLabel ?? 'Confirm'}
                            </Button>
                        </div>
                    </AlertDialog.Popup>
                </AlertDialog.Portal>
            </AlertDialog.Root>
        </ConfirmContext.Provider>
    );
}

export function useConfirm(): ConfirmContextValue {
    const ctx = useContext(ConfirmContext);
    if (ctx === null) throw new Error('useConfirm must be used within a ConfirmProvider');
    return ctx;
}

export type { ConfirmOptions };
