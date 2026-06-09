/**
 * Plugin-registered custom field types.
 *
 * Renderers are lazy-loaded from `virtual:astromech/plugins/components`
 * (code-gen'd import() calls). Each loaded module default-exports the
 * renderer and may export `validate(value, field)`; validation errors render
 * inline. The registration's `defaultValue` fills in when the field has no
 * stored value yet.
 */

import React from 'react';
import { fieldTypes } from 'virtual:astromech/plugins/components';
import type { BaseFieldProps } from '@/types/index.js';
import { Spinner } from '@/admin/components/ui/index.js';
import { PluginErrorBoundary } from '@/admin/components/plugins/PluginErrorBoundary.js';

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
            const [error, setError] = React.useState<string | undefined>(undefined);
            const value = props.value === undefined ? defaultValue : props.value;

            function handleChange(name: string, next: unknown): void {
                setError(validate?.(next, props.field));
                props.onChange(name, next);
            }

            return (
                <>
                    <Renderer {...props} value={value} onChange={handleChange} />
                    {error !== undefined && <p className="am-field-error">{error}</p>}
                </>
            );
        }

        return { default: PluginFieldInner };
    });

    lazyCache.set(type, lazy);
    return lazy;
}

export function PluginField(props: BaseFieldProps): React.ReactElement {
    const Lazy = lazyFieldFor(props.field.type);
    return (
        <PluginErrorBoundary plugin={props.field.type}>
            <React.Suspense fallback={<Spinner size="sm" />}>
                <Lazy {...props} />
            </React.Suspense>
        </PluginErrorBoundary>
    );
}
