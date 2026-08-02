/**
 * React error boundary around any externally-authored admin component (spec
 * §3.12): a throw inside a plugin field, slot, page or a host page component
 * never takes down the admin shell. The fallback is localized and names the
 * `source` — the owning plugin's namespace, or the page path for a host page.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

type ComponentErrorBoundaryProps = {
    source: string;
    children: React.ReactNode;
};

type ComponentErrorBoundaryState = {
    hasError: boolean;
    message?: string;
};

/** Localized crash banner; in dev it also shows the raw error message. */
function ComponentErrorFallback({
    source,
    message,
}: {
    source: string;
    message?: string | undefined;
}): React.ReactElement {
    const { t } = useTranslation();
    return (
        <div className="am-banner am-banner-error" role="alert">
            {t('errors.componentCrashed', { source })}
            {import.meta.env.DEV && message !== undefined && (
                <pre className="am-banner-detail">{message}</pre>
            )}
        </div>
    );
}

export class ComponentErrorBoundary extends React.Component<
    ComponentErrorBoundaryProps,
    ComponentErrorBoundaryState
> {
    override state: ComponentErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(error: unknown): ComponentErrorBoundaryState {
        return {
            hasError: true,
            message: error instanceof Error ? error.message : String(error),
        };
    }

    override componentDidCatch(error: unknown): void {
        console.error('[astromech] component crashed:', this.props.source, error);
    }

    override render(): React.ReactNode {
        if (this.state.hasError) {
            return (
                <ComponentErrorFallback
                    source={this.props.source}
                    message={this.state.message}
                />
            );
        }
        return this.props.children;
    }
}
