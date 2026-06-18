import React from 'react';
import { describe, expect, it } from 'vitest';
import type { FieldComponent } from '@/admin/definitions/field-registry.js';
import { getFieldComponent, registerField } from '@/admin/definitions/field-registry.js';

describe('field-registry', () => {
    it('returns a registered component', () => {
        const component: FieldComponent = () => React.createElement('input');
        registerField('text', component);
        expect(getFieldComponent('text')).toBe(component);
    });

    it('returns undefined for an unregistered type', () => {
        expect(getFieldComponent('not-registered')).toBeUndefined();
    });
});
