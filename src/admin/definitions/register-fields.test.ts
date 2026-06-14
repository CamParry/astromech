import { describe, expect, it } from 'vitest';
import { CORE_FIELD_TYPES } from '@/types/index.js';
import './register-fields.js';
import { getFieldComponent } from './field-registry.js';

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
    it('registers a component for every core field type except layout containers', () => {
        for (const type of REGISTERED_FIELD_TYPES) {
            expect(
                getFieldComponent(type),
                `missing component for "${type}"`
            ).toBeDefined();
        }
    });

    it('does not register accordion or tab (layout containers handled by page renderer)', () => {
        expect(getFieldComponent('accordion')).toBeUndefined();
        expect(getFieldComponent('tab')).toBeUndefined();
    });

    it('returns undefined for an unknown field type', () => {
        expect(getFieldComponent('__nope__')).toBeUndefined();
    });
});
