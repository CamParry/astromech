/**
 * Field-input registry — field type → React input component. Plugin custom
 * field types are not registered here; they're discovered lazily via the
 * virtual plugin-components module when `getFieldComponent` returns undefined.
 */
import type { FieldWrapperProps } from '../components/fields/field-wrapper';
import type { BaseFieldProps } from 'astromech';
import type * as React from 'react';

export type FieldComponent = (props: BaseFieldProps) => React.ReactElement;

/** How a registered field type is drawn around its component. */
export type FieldRegistrationOptions = {
    /** What its label renders as; see `FieldWrapperProps`. Defaults to `label`. */
    labelElement?: FieldWrapperProps['labelElement'];
};

type FieldRegistration = { component: FieldComponent; options: FieldRegistrationOptions };

const registry = new Map<string, FieldRegistration>();

export function registerField(
    type: string,
    component: FieldComponent,
    options: FieldRegistrationOptions = {}
): void {
    registry.set(type, { component, options });
}

/** undefined → caller falls through to the plugin lazy-field path or text input. */
export function getFieldComponent(type: string): FieldComponent | undefined {
    return registry.get(type)?.component;
}

/** The options `type` was registered with, or none for an unregistered type. */
export function getFieldOptions(type: string): FieldRegistrationOptions {
    return registry.get(type)?.options ?? {};
}
