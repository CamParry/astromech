/**
 * PluginSlot — renders every permission-visible plugin contribution for a
 * named admin-shell slot (global-overlay, right-drawer, toolbar).
 *
 * Returns null when the slot has no visible contributions so an empty wrapper
 * collapses via CSS :empty.
 */

import React from 'react';
import { slots } from 'virtual:astromech/plugins/components';
import type { AdminSlotName } from '@/types/config';
import { usePermissions } from '@/admin/hooks/index';
import { PluginUiProvider } from '@/admin/context/plugin';
import { ComponentErrorBoundary } from '@/admin/components/pages/ComponentErrorBoundary';

type LazySlot = React.LazyExoticComponent<React.ComponentType>;
const lazyCache = new Map<string, LazySlot>();

function lazyFor(
    id: string,
    load: () => Promise<{ default: React.ComponentType }>
): LazySlot {
    const cached = lazyCache.get(id);
    if (cached) return cached;
    const lazy = React.lazy(load);
    lazyCache.set(id, lazy);
    return lazy;
}

/** Renders every permission-visible plugin contribution for a named admin-shell slot. */
export function PluginSlot({ name }: { name: AdminSlotName }): React.ReactElement | null {
    const { hasPermission } = usePermissions();
    const contributions = slots[name] ?? [];
    const visible = contributions.filter(
        (c) => c.permission === null || hasPermission(c.permission)
    );
    if (visible.length === 0) return null;
    return (
        <>
            {visible.map((c) => {
                const Lazy = lazyFor(c.id, c.load);
                return (
                    <PluginUiProvider
                        key={c.id}
                        identity={{
                            namespace: c.plugin,
                            serviceKey: c.serviceKey,
                            permissionNamespace: c.namespace,
                        }}
                    >
                        <ComponentErrorBoundary source={c.plugin}>
                            <React.Suspense fallback={null}>
                                <Lazy />
                            </React.Suspense>
                        </ComponentErrorBoundary>
                    </PluginUiProvider>
                );
            })}
        </>
    );
}
