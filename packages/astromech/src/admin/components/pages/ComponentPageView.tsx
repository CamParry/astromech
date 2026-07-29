/**
 * Shared renderer for `component`-mode admin pages, used by both the host
 * (`/page/*`) and plugin (`/plugin/*`) catch-alls. Owns: the module-level
 * `React.lazy` cache, the Page shell, the error boundary and the Suspense
 * fallback.
 *
 * Parameterized by a pre-resolved `load` + `cacheKey` so the caller is
 * origin-agnostic. `identity` is supplied only by plugin surfaces — a host page
 * has no plugin identity, so it gets no `PluginUiProvider` and its components
 * must not call `useAstromechPlugin()`.
 */

import React from 'react';
import { ComponentErrorBoundary } from '@/admin/components/pages/ComponentErrorBoundary.js';
import { PluginUiProvider, type PluginUiIdentity } from '@/admin/context/plugin.js';
import {
    Page,
    PageContent,
    PageHeader,
    PageTitle,
    Spinner,
} from '@/admin/components/ui/index.js';

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
