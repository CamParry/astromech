import React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Button } from './button.js';
import type { ButtonVariant } from './button.js';

type ModalProps = {
    open: boolean;
    onClose: () => void;
    title?: string;
    headerActions?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg';
};

type ConfirmModalProps = {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message?: string;
    confirmLabel?: string;
    confirmVariant?: ButtonVariant;
    loading?: boolean;
};

export function Modal({ open, onClose, title, headerActions, children, footer, size = 'md' }: ModalProps): React.ReactElement {
    return (
        <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <Dialog.Portal>
                <Dialog.Backdrop className="am-modal__backdrop" />
                <Dialog.Popup className={`am-modal__panel am-modal__panel--${size}`}>
                    {title !== undefined && (
                        <div className="am-modal__header">
                            <Dialog.Title className="am-modal__title">{title}</Dialog.Title>
                            {headerActions && <div className="am-modal__header-actions">{headerActions}</div>}
                        </div>
                    )}
                    <div className="am-modal__body">{children}</div>
                    {footer !== undefined && <div className="am-modal__footer">{footer}</div>}
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

export function ConfirmModal({
    open,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Confirm',
    confirmVariant = 'danger',
    loading = false,
}: ConfirmModalProps): React.ReactElement {
    return (
        <AlertDialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <AlertDialog.Portal>
                <AlertDialog.Backdrop className="am-modal__backdrop" />
                <AlertDialog.Popup className="am-modal__panel am-modal__panel--sm">
                    <div className="am-modal__header">
                        <AlertDialog.Title className="am-modal__title">{title}</AlertDialog.Title>
                    </div>
                    {message !== undefined && (
                        <div className="am-modal__body">
                            <AlertDialog.Description>{message}</AlertDialog.Description>
                        </div>
                    )}
                    <div className="am-modal__footer">
                        <AlertDialog.Close
                            render={
                                <Button variant="secondary" disabled={loading}>
                                    Cancel
                                </Button>
                            }
                        />
                        <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
                            {confirmLabel}
                        </Button>
                    </div>
                </AlertDialog.Popup>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    );
}

export type { ModalProps, ConfirmModalProps };
