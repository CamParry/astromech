/**
 * Plugin-registered custom field types, lazy-loaded from
 * `virtual:astromech/plugins/components`. A loaded module default-exports
 * the renderer and may export `validate(value, field)` for inline errors.
 */

import type { BaseFieldProps } from '@/types/index';
import React from 'react';
import { fieldTypes } from 'virtual:astromech/plugins/components';
import { useFieldControl } from '@/admin/components/fields/field-control-context';
import { ComponentErrorBoundary } from '@/admin/components/pages/component-error-boundary';
import { Spinner } from '@/admin/components/ui/spinner';
import { PluginUiProvider } from '@/admin/context/plugin';

export function hasPluginFieldType(type: string): boolean {
    return type in fieldTypes;
}

type LazyField = React.LazyExoticComponent<React.ComponentType<BaseFieldProps>>;

const lazyCache = new Map<string, LazyField>();

function lazyFieldFor(type: string): LazyField {
    const cached = lazyCache.get(type);
    if (cached) return cached;

    const entry = fieldTypes[type];
    if (!entry) {
        throw new Error(`[Astromech] No plugin field type registered for "${type}".`);
    }
    const { load, defaultValue } = entry;
    const lazy = React.lazy(async () => {
        const mod = await load();
        const Renderer = mod.default;
        const validate = mod.validate;

        function PluginFieldInner(props: BaseFieldProps): React.ReactElement {
            const { hasError } = useFieldControl();
            const [error, setError] = React.useState<string | undefined>(undefined);
            const value = props.value === undefined ? defaultValue : props.value;

            function handleChange(name: string, next: unknown): void {
                setError(validate?.(next, props.field));
                props.onChange(name, next);
            }

            return (
                <>
                    <Renderer {...props} value={value} onChange={handleChange} />
                    {!hasError && error !== undefined && (
                        <p className="am-field-error">{error}</p>
                    )}
                </>
            );
        }

        return { default: PluginFieldInner };
    });

    lazyCache.set(type, lazy);
    return lazy;
}

/** Renders the lazy-loaded field component registered for `props.field.type`. */
export function PluginField(props: BaseFieldProps): React.ReactElement {
    const Lazy = lazyFieldFor(props.field.type);
    const entry = fieldTypes[props.field.type];
    const identity = {
        namespace: entry?.plugin ?? props.field.type,
        serviceKey: entry?.serviceKey ?? props.field.type,
        permissionNamespace: entry?.namespace ?? props.field.type,
    };
    return (
        <PluginUiProvider identity={identity}>
            <ComponentErrorBoundary source={identity.namespace}>
                <React.Suspense fallback={<Spinner size="sm" />}>
                    <Lazy {...props} />
                </React.Suspense>
            </ComponentErrorBoundary>
        </PluginUiProvider>
    );
}
