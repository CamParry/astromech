/**
 * Shared renderer for `component`-mode admin pages, used by both the host
 * and plugin catch-alls. Parameterized by a pre-resolved `load` + `cacheKey`;
 * `identity` is supplied only by plugin surfaces, which get a `PluginUiProvider`.
 */
import type { PluginUiIdentity } from '../../context/plugin';
import React from 'react';
import { PluginUiProvider } from '../../context/plugin';
import { Page, PageContent, PageHeader, PageTitle } from '../ui/page';
import { Spinner } from '../ui/spinner';
import { ComponentErrorBoundary } from './component-error-boundary';

export type ComponentPageViewProps = {
    /** Stable key for the module-level React.lazy cache. */
    cacheKey: string;
    load: () => Promise<{ default: React.ComponentType }>;
    /** Page header title; omit for no header. */
    title?: React.ReactNode;
    /** Attribution for the error boundary (plugin namespace, or page path). */
    source: string;
    /** Plugin surfaces only — omit for host pages. */
    identity?: PluginUiIdentity;
};

type LazyPage = React.LazyExoticComponent<React.ComponentType>;

const lazyCache = new Map<string, LazyPage>();

function lazyPageFor(
    cacheKey: string,
    load: () => Promise<{ default: React.ComponentType }>
): LazyPage {
    const cached = lazyCache.get(cacheKey);
    if (cached) return cached;

    const lazy = React.lazy(load);
    lazyCache.set(cacheKey, lazy);
    return lazy;
}

export function ComponentPageView({
    cacheKey,
    load,
    title,
    source,
    identity,
}: ComponentPageViewProps): React.ReactElement {
    const LazyComponent = lazyPageFor(cacheKey, load);

    const body = (
        <ComponentErrorBoundary source={source}>
            <React.Suspense fallback={<Spinner size="md" />}>
                <LazyComponent />
            </React.Suspense>
        </ComponentErrorBoundary>
    );

    return (
        <Page>
            {title !== undefined && (
                <PageHeader>
                    <PageTitle>{title}</PageTitle>
                </PageHeader>
            )}
            <PageContent>
                {identity !== undefined ? (
                    <PluginUiProvider identity={identity}>{body}</PluginUiProvider>
                ) : (
                    body
                )}
            </PageContent>
        </Page>
    );
}
