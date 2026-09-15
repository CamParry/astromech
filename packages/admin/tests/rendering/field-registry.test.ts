import type { FieldComponent } from '@/admin/rendering/field-registry';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { getFieldComponent, registerField } from '@/admin/rendering/field-registry';

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
