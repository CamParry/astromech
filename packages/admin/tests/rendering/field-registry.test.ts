import type { FieldComponent } from '@/admin/rendering/field-registry';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { getFieldComponent, registerField } from '@/admin/rendering/field-registry';

describe('field-registry', () => {
    it('returns a registered component', () => {
        // A type of its own: the registry is shared by every file in the worker,
        // so registering over `text` would replace the real input for them.
        const type = `probe-${crypto.randomUUID()}`;
        const component: FieldComponent = () => React.createElement('input');
        registerField(type, component);
        expect(getFieldComponent(type)).toBe(component);
    });

    it('returns undefined for an unregistered type', () => {
        expect(getFieldComponent('not-registered')).toBeUndefined();
    });
});
