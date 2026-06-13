import { describe, expect, it } from 'vitest';
import { CORE_FIELD_TYPES } from '@/types/index.js';
import './register-fields.js';
import { getFieldComponent } from './field-registry.js';

describe('register-fields', () => {
    it('registers a component for every core field type', () => {
        for (const type of CORE_FIELD_TYPES) {
            expect(
                getFieldComponent(type),
                `missing component for "${type}"`
            ).toBeDefined();
        }
    });

    it('returns undefined for an unknown field type', () => {
        expect(getFieldComponent('__nope__')).toBeUndefined();
    });
});
