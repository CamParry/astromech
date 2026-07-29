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
};

function ComponentErrorFallback({ source }: { source: string }): React.ReactElement {
    const { t } = useTranslation();
    return (
        <div className="am-banner am-banner-error" role="alert">
            {t('errors.componentCrashed', { source })}
        </div>
    );
}

export class ComponentErrorBoundary extends React.Component<
    ComponentErrorBoundaryProps,
    ComponentErrorBoundaryState
> {
    override state: ComponentErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): ComponentErrorBoundaryState {
        return { hasError: true };
    }

    override componentDidCatch(error: unknown): void {
        console.error('[astromech] component crashed:', this.props.source, error);
    }

    override render(): React.ReactNode {
        if (this.state.hasError) {
            return <ComponentErrorFallback source={this.props.source} />;
        }
        return this.props.children;
    }
}
