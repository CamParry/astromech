/**
 * Compiles a form's stored `fields` block instances into core
 * `FieldDefinition`s, so submissions validate through core's own pipeline.
 * Input is untrusted stored JSON, so every step here is defensive.
 */

import type { FieldDefinition, Label, SelectOption, ValidationRule } from 'astromech';
import * as fields from 'astromech/fields';
import type { FormFieldKind, StoredFormField } from '../types.js';

/**
 * A form's stored blocks as a flat list of leaf fields — a submission is a flat
 * map of values. Anything unusable is skipped rather than thrown.
 */
export function compileFormFields(stored: unknown): FieldDefinition[] {
    if (!Array.isArray(stored)) return [];
    const compiled: FieldDefinition[] = [];
    for (const instance of stored) {
        if (!isUsable(instance)) continue;
        const field = compileOne(instance);
        if (field !== null) compiled.push(field);
    }
    return compiled;
}

/** One block instance as a leaf field, or `null` for an unknown `_type`. */
function compileOne(stored: StoredFormField): FieldDefinition | null {
    const name = stored.name as string;
    const kind = stored._type as FormFieldKind;
    const base = baseOptions(stored);

    switch (kind) {
        case 'text':
            return fields.text(name, { ...base, validation: lengthRules(stored) });
        case 'tel':
            return fields.text(name, { ...base });
        case 'hidden':
            return fields.text(name, {
                ...base,
                defaultValue: stored.defaultValue,
            });
        case 'textarea':
            return fields.textarea(name, { ...base, validation: lengthRules(stored) });
        case 'email':
            return fields.email(name, { ...base });
        case 'url':
            return fields.url(name, { ...base });
        case 'number':
            return fields.number(name, { ...base, validation: rangeRules(stored) });
        case 'date':
            return fields.date(name, { ...base });
        case 'checkbox':
            return fields.boolean(name, { ...base });
        case 'select': {
            const options = asOptions(stored.options);
            return fields.select(name, {
                ...base,
                options,
                validation: choiceRules(options),
            });
        }
        case 'radio': {
            const options = asOptions(stored.options);
            return fields.radioGroup(name, {
                ...base,
                options,
                validation: choiceRules(options),
            });
        }
        case 'checkboxGroup': {
            const options = asOptions(stored.options);
            return fields.multiselect(name, {
                ...base,
                options,
                validation: choiceRules(options),
            });
        }
        default:
            return null;
    }
}

/**
 * True for an enabled block instance whose `name` fits the field-path grammar.
 * A name holding `.`, `[` or `]` cannot be an error key, so skipping it costs
 * one field rather than 500-ing every submission.
 */
function isUsable(instance: unknown): instance is StoredFormField {
    if (typeof instance !== 'object' || instance === null) return false;
    const stored = instance as StoredFormField;
    if (stored._disabled === true) return false;
    return typeof stored.name === 'string' && fields.isValidFieldName(stored.name);
}

type CommonOptions = { label?: Label; required: boolean; description?: Label };

/**
 * The label / required / description every kind shares. Unusable values are
 * omitted rather than set to `undefined`, per `exactOptionalPropertyTypes`.
 */
function baseOptions(stored: StoredFormField): CommonOptions {
    const label = typeof stored.label === 'string' ? stored.label : undefined;
    const description =
        typeof stored.description === 'string' ? stored.description : undefined;
    return {
        required: stored.required === true,
        ...(label !== undefined ? { label } : {}),
        ...(description !== undefined ? { description } : {}),
    };
}

/** `{ label, value }` rows from the `options` repeater, skipping malformed ones. */
function asOptions(value: unknown): SelectOption[] {
    if (!Array.isArray(value)) return [];
    const options: SelectOption[] = [];
    for (const row of value) {
        if (typeof row !== 'object' || row === null) continue;
        const { label, value: optionValue } = row as { label?: unknown; value?: unknown };
        if (typeof optionValue !== 'string') continue;
        options.push({
            value: optionValue,
            label: typeof label === 'string' ? label : optionValue,
        });
    }
    return options;
}

/** An `enum` rule constraining a choice field to its declared options. */
function choiceRules(options: SelectOption[]): ValidationRule[] {
    return options.length > 0 ? [{ enum: options.map((option) => option.value) }] : [];
}

/** `minLength` / `maxLength` rules, for whichever the author set. */
function lengthRules(stored: StoredFormField): ValidationRule[] {
    const rules: ValidationRule[] = [];
    const minLength = asNumber(stored.minLength);
    const maxLength = asNumber(stored.maxLength);
    if (minLength !== undefined) rules.push({ minLength });
    if (maxLength !== undefined) rules.push({ maxLength });
    return rules;
}

/** `min` / `max` rules, for whichever the author set. */
function rangeRules(stored: StoredFormField): ValidationRule[] {
    const rules: ValidationRule[] = [];
    const min = asNumber(stored.min);
    const max = asNumber(stored.max);
    if (min !== undefined) rules.push({ min });
    if (max !== undefined) rules.push({ max });
    return rules;
}

/** The value if it is a number, else `undefined`. */
function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}
