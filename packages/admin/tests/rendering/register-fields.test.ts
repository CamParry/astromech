import { describe, expect, it } from 'vitest';
import { CORE_FIELD_TYPES } from '@/types/index';
import '@/admin/rendering/register-fields';
import { getFieldComponent } from '@/admin/rendering/field-registry';

const LAYOUT_CONTAINERS_NOT_IN_REGISTRY = new Set([
    'accordion',
    'tab',
    'section',
    'tabs',
]);

const REGISTERED_FIELD_TYPES = CORE_FIELD_TYPES.filter(
    (type) => !LAYOUT_CONTAINERS_NOT_IN_REGISTRY.has(type)
);

describe('register-fields', () => {
    it('registers a component for every core field type except layout fields', () => {
        for (const type of REGISTERED_FIELD_TYPES) {
            expect(
                getFieldComponent(type),
                `missing component for "${type}"`
            ).toBeDefined();
        }
    });

    it('does not register accordion or tab (layout fields handled by page renderer)', () => {
        expect(getFieldComponent('accordion')).toBeUndefined();
        expect(getFieldComponent('tab')).toBeUndefined();
    });

    it('returns undefined for an unknown field type', () => {
        expect(getFieldComponent('__nope__')).toBeUndefined();
    });
});
