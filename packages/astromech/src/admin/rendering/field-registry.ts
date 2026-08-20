/**
 * Field-input registry — field type → React input component. Plugin custom
 * field types are not registered here; they're discovered lazily via the
 * virtual plugin-components module when `getFieldComponent` returns undefined.
 */
import type { BaseFieldProps } from '@/types/index';
import type * as React from 'react';

export type FieldComponent = (props: BaseFieldProps) => React.ReactElement;

const registry = new Map<string, FieldComponent>();

export function registerField(type: string, component: FieldComponent): void {
    registry.set(type, component);
}

/** undefined → caller falls through to the plugin lazy-field path or text input. */
export function getFieldComponent(type: string): FieldComponent | undefined {
    return registry.get(type);
}
