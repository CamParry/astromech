/**
 * Per-plugin React error boundary (spec §3.12): a throw inside a plugin's
 * component never takes down the admin shell. The fallback is localized and
 * names the plugin; the error is logged with plugin attribution.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

type PluginErrorBoundaryProps = {
    plugin: string;
    children: React.ReactNode;
};

type PluginErrorBoundaryState = {
    hasError: boolean;
};

function PluginErrorFallback({ plugin }: { plugin: string }): React.ReactElement {
    const { t } = useTranslation();
    return (
        <div className="am-banner am-banner-error" role="alert">
            {t('plugins.componentError', { plugin })}
        </div>
    );
}

export class PluginErrorBoundary extends React.Component<
    PluginErrorBoundaryProps,
    PluginErrorBoundaryState
> {
    override state: PluginErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): PluginErrorBoundaryState {
        return { hasError: true };
    }

    override componentDidCatch(error: unknown): void {
        console.error(`[plugin:${this.props.plugin}] component crashed`, error);
    }

    override render(): React.ReactNode {
        if (this.state.hasError) {
            return <PluginErrorFallback plugin={this.props.plugin} />;
        }
        return this.props.children;
    }
}
