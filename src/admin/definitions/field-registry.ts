/**
 * Field-input registry — field type → React input component.
 *
 * Module-level Map (no globalThis); same single-SPA-bundle rationale as
 * cell-registry.ts. Plugin custom field types are NOT registered here — they
 * are discovered lazily via the virtual plugin-components module; callers fall
 * through to that path when getFieldComponent returns undefined.
 */
import type * as React from 'react';
import type { BaseFieldProps } from '@/types/index.js';

export type FieldComponent = (props: BaseFieldProps) => React.ReactElement;

const registry = new Map<string, FieldComponent>();

export function registerField(type: string, component: FieldComponent): void {
    registry.set(type, component);
}

/** undefined → caller falls through to the plugin lazy-field path or text input. */
export function getFieldComponent(type: string): FieldComponent | undefined {
    return registry.get(type);
}
