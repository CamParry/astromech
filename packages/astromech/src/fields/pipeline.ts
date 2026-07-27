/**
 * Field-processing pipeline — coerce → default → validate.
 *
 * Pure logic: no domain/DB imports. The `reads` handle on `ctx` is the
 * injection point for any async checks (uniqueness, references).
 *
 * Internal use only — deep-import from `@/fields/pipeline.js`; not
 * re-exported from `fields/index.ts`.
 *
 * P2 scope: top-level data fields only. Data containers (group/repeater/
 * blocks/tree) are treated as opaque leaves; their children are not recursed
 * here (that's P3/P4).
 */

import type {
    FieldDefinition,
    FieldErrors,
    FieldValidationContext,
    ValidationRule,
} from '@/types/fields.js';
import { getFieldTypeDescriptor } from './descriptors.js';
import { flattenFieldNodes } from './helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isEmpty(v: unknown): boolean {
    return (
        v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
    );
}

// ---------------------------------------------------------------------------
// Rule runner
// ---------------------------------------------------------------------------

async function runRule(
    rule: ValidationRule,
    ctx: FieldValidationContext
): Promise<string | null> {
    const { value } = ctx;

    if ('minLength' in rule) {
        if (
            (typeof value === 'string' || Array.isArray(value)) &&
            value.length < rule.minLength
        ) {
            return `Must be at least ${rule.minLength} characters`;
        }
        return null;
    }

    if ('maxLength' in rule) {
        if (
            (typeof value === 'string' || Array.isArray(value)) &&
            value.length > rule.maxLength
        ) {
            return `Must be at most ${rule.maxLength} characters`;
        }
        return null;
    }

    if ('min' in rule) {
        if (typeof value === 'number' && value < rule.min) {
            return `Must be at least ${rule.min}`;
        }
        return null;
    }

    if ('max' in rule) {
        if (typeof value === 'number' && value > rule.max) {
            return `Must be at most ${rule.max}`;
        }
        return null;
    }

    if ('pattern' in rule) {
        if (typeof value === 'string' && !new RegExp(rule.pattern).test(value)) {
            return rule.message ?? 'Invalid format';
        }
        return null;
    }

    if ('email' in rule) {
        if (typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return 'Must be a valid email address';
        }
        return null;
    }

    if ('url' in rule) {
        if (typeof value === 'string') {
            try {
                new URL(value);
            } catch {
                return 'Must be a valid URL';
            }
        }
        return null;
    }

    if ('enum' in rule) {
        if (!rule.enum.includes(value as string)) {
            return `Must be one of: ${rule.enum.join(', ')}`;
        }
        return null;
    }

    if ('unique' in rule) {
        const isUniq = await ctx.reads.isUnique(ctx.field, value);
        if (!isUniq) return 'Already in use';
        return null;
    }

    if ('custom' in rule) {
        const r = await rule.custom(ctx);
        if (r !== true) {
            return typeof r === 'string' ? r : 'Invalid value';
        }
        return null;
    }

    return null;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function processFields(
    values: Record<string, unknown>,
    definitions: FieldDefinition[],
    ctx: Omit<FieldValidationContext, 'value' | 'values' | 'field' | 'path'>
): Promise<{ values: Record<string, unknown>; errors: FieldErrors }> {
    const fields = flattenFieldNodes(definitions);
    const result = { ...values };
    const errors: FieldErrors = {};

    for (const field of fields) {
        // Step a: coerce
        const descriptor = getFieldTypeDescriptor(field.type);
        let v = descriptor?.coerce
            ? descriptor.coerce(values[field.name])
            : values[field.name];

        // Step b: default (create only, when value is absent)
        if (ctx.operation === 'create' && (v === undefined || v === null)) {
            if (field.defaultValue !== undefined) {
                v = field.defaultValue;
            } else if (descriptor?.defaultValue !== undefined) {
                v = descriptor.defaultValue;
            }
        }

        // Step c: write back (never introduce undefined keys)
        if (v !== undefined) {
            result[field.name] = v;
        }

        // Step d: validate
        const messages: string[] = [];

        if (field.required === true && isEmpty(v)) {
            // Required + empty: single message, skip all other rules
            messages.push('This field is required');
        } else if (!isEmpty(v)) {
            // Present value: run all rules, collect all messages
            const fieldCtx: FieldValidationContext = {
                value: v,
                values: result,
                field,
                path: [field.name],
                operation: ctx.operation,
                host: ctx.host,
                user: ctx.user,
                reads: ctx.reads,
            };

            // 1. Declarative rules
            for (const rule of field.validation ?? []) {
                const msg = await runRule(rule, fieldCtx);
                if (msg !== null) messages.push(msg);
            }

            // 2. Descriptor-level validator
            if (descriptor?.validate) {
                const r = await descriptor.validate(fieldCtx);
                if (r !== true) messages.push(r);
            }
        }
        // else: optional + empty → no messages (valid)

        if (messages.length > 0) {
            errors[field.name] = messages;
        }
    }

    return { values: result, errors };
}
