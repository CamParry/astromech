/**
 * Toast notification system built on Base UI Toast.
 *
 * Maintains the existing useToast() API so all call sites are unchanged:
 *   const { toast, dismiss } = useToast();
 *   toast({ message: 'Saved', variant: 'success' });
 */

import React from 'react';
import { Toast } from '@base-ui/react/toast';

// ============================================================================
// Types
// ============================================================================

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

type ToastOptions = {
    message: string;
    variant?: ToastVariant;
    duration?: number;
};

type ToastData = {
    message: string;
    variant?: ToastVariant;
};

// ============================================================================
// Internal viewport — rendered inside Toast.Provider
// ============================================================================

function ToastViewport(): React.ReactElement {
    const { toasts } = Toast.useToastManager();
    return (
        <Toast.Viewport className="am-toast-region" aria-label="Notifications">
            {toasts.map((toast) => {
                const data = toast.data as ToastData | undefined;
                return (
                    <Toast.Root
                        key={toast.id}
                        toast={toast}
                        className={[
                            'am-toast',
                            data?.variant ? `am-toast-${data.variant}` : '',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                    >
                        <Toast.Content className="am-toast-content">
                            <Toast.Title className="am-toast-message">
                                {data?.message ?? ''}
                            </Toast.Title>
                        </Toast.Content>
                        <Toast.Close className="am-toast-dismiss" aria-label="Dismiss">
                            ×
                        </Toast.Close>
                    </Toast.Root>
                );
            })}
        </Toast.Viewport>
    );
}

// ============================================================================
// Provider
// ============================================================================

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
    return (
        <Toast.Provider>
            {children}
            <Toast.Portal>
                <ToastViewport />
            </Toast.Portal>
        </Toast.Provider>
    );
}

// ============================================================================
// Hook — same API as before
// ============================================================================

export function useToast(): {
    toast: (opts: ToastOptions) => void;
    dismiss: (id: string) => void;
} {
    const { add, close } = Toast.useToastManager();
    return {
        toast: ({ message, variant, duration }: ToastOptions) => {
            add({
                title: message,
                data: { message, ...(variant !== undefined && { variant }) } satisfies ToastData,
                timeout: duration ?? 4000,
            } as Parameters<typeof add>[0]);
        },
        dismiss: (id: string) => close(id),
    };
}

export type { ToastOptions, ToastVariant };
