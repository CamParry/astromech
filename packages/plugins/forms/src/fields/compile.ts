/**
 * Compiles a form's stored `fields` block instances into real core
 * `FieldDefinition`s, so `processFields` (`astromech/fields`) validates
 * submissions through core's own coerce → default → validate pipeline
 * instead of a second, drifting evaluator.
 *
 * Input is untrusted stored JSON (`unknown`) — every step is defensive.
 * The output is deliberately a FLAT list of leaf fields, never containers,
 * because a form submission is a flat map of answers: one stored block instance
 * is one answer key. That is the shape being modelled, not a limitation of the
 * pipeline (which does recurse into containers).
 */

import type { FieldDefinition, Label, SelectOption, ValidationRule } from 'astromech';
import * as fields from 'astromech/fields';
import type { FormFieldKind, StoredFormField } from '../types.js';

/**
 * True for a stored block instance that should be compiled: an enabled object
 * with a usable `name`.
 *
 * "Usable" includes satisfying the core field-path grammar. The form builder
 * rejects a bad `name` on save, but a form stored before that rule existed can
 * still hold one, and a name containing `.`, `[` or `]` cannot be used as an
 * error key — `processFields` throws on it. Skipping the field degrades to a
 * missing question rather than a 500 on every submission.
 */
function isUsable(instance: unknown): instance is StoredFormField {
    if (typeof instance !== 'object' || instance === null) return false;
    const stored = instance as StoredFormField;
    if (stored._disabled === true) return false;
    return typeof stored.name === 'string' && fields.isValidFieldName(stored.name);
}

/** Numeric-only extraction — stored config is untrusted JSON, may hold anything. */
function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

/** `{ label, value }` rows from the `options` repeater, tolerant of malformed entries. */
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

function choiceRules(options: SelectOption[]): ValidationRule[] {
    return options.length > 0 ? [{ enum: options.map((option) => option.value) }] : [];
}

function lengthRules(stored: StoredFormField): ValidationRule[] {
    const rules: ValidationRule[] = [];
    const minLength = asNumber(stored.minLength);
    const maxLength = asNumber(stored.maxLength);
    if (minLength !== undefined) rules.push({ minLength });
    if (maxLength !== undefined) rules.push({ maxLength });
    return rules;
}

function rangeRules(stored: StoredFormField): ValidationRule[] {
    const rules: ValidationRule[] = [];
    const min = asNumber(stored.min);
    const max = asNumber(stored.max);
    if (min !== undefined) rules.push({ min });
    if (max !== undefined) rules.push({ max });
    return rules;
}

type CommonOptions = { label?: Label; required: boolean; description?: Label };

// `exactOptionalPropertyTypes` treats `{ label: undefined }` as distinct from
// an absent `label` key, so an unusable value must be omitted, not nulled out.
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

/** Compiles one stored block instance into a leaf `FieldDefinition`, or `null` for an unknown `_type`. */
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
 * Turns a form's stored `fields` block instances into a flat list of core
 * `FieldDefinition`s. Non-array input, disabled instances, instances without
 * a usable `name`, and unknown `_type`s are all skipped rather than thrown.
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

/**
 * The `name` of the first enabled `email` block on a form, or `undefined` when
 * there is none. Used to resolve the confirmation email's recipient when the
 * form doesn't declare an explicit `confirmToField`.
 */
export function firstEmailFieldName(stored: unknown): string | undefined {
    if (!Array.isArray(stored)) return undefined;
    for (const instance of stored) {
        if (!isUsable(instance)) continue;
        if (instance._type === 'email') return instance.name as string;
    }
    return undefined;
}
