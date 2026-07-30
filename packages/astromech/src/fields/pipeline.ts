/**
 * Field-processing pipeline — coerce → default → validate.
 *
 * Pure logic: no domain/DB imports. The `reads` handle on `ctx` is the
 * injection point for any async checks (uniqueness, references).
 *
 * Public API via `astromech/fields` (`processFields`). Entries is not its
 * only consumer: any plugin that composes `FieldDefinition[]` at runtime can
 * validate through the same coerce → default → validate path as core.
 *
 * Data containers (group/repeater/blocks/tree) are recursed into: a descriptor
 * with a `children` slot reports its nested value scopes, each of which is run
 * through the same coerce → default → validate pass. Errors are keyed by the
 * `_id`-based path grammar (`fields/field-path.ts`), so a nested error lands on
 * `sections[a1].items[b2].title` and a top-level one stays the bare field name.
 * Nothing here switches on field type.
 */

import type {
    FieldDefinition,
    FieldErrors,
    FieldPathSegment,
    FieldValidationContext,
    ValidationRule,
} from '@/types/fields.js';
import { getFieldTypeDescriptor } from './descriptors.js';
import { formatFieldPath } from './field-path.js';
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
        // A multi-value field (`multiselect`, and so a checkbox group) holds an
        // ARRAY. The rule then means "every selected value is permitted" — not
        // "the array itself is a permitted value", which is what a bare
        // `includes` asks and which rejects every non-empty selection.
        const selected = Array.isArray(value) ? value : [value];
        const permitted = selected.every((entry) => rule.enum.includes(entry as string));
        if (!permitted) {
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

/** The host-supplied half of the validation context — everything not per-field. */
type PipelineContext = Omit<
    FieldValidationContext,
    'value' | 'values' | 'field' | 'path'
>;

/**
 * Run one value scope: the root record, or one container item / group object.
 * `values` is mutated in place, because a nested scope object is a live
 * reference inside the container value already written to its parent.
 */
async function processScope(
    values: Record<string, unknown>,
    definitions: FieldDefinition[],
    parentSegments: readonly FieldPathSegment[],
    ctx: PipelineContext,
    errors: FieldErrors
): Promise<void> {
    for (const field of flattenFieldNodes(definitions)) {
        const descriptor = getFieldTypeDescriptor(field.type);
        const segments: FieldPathSegment[] = [
            ...parentSegments,
            { kind: 'field', name: field.name },
        ];
        const path = formatFieldPath(segments);

        // Step a: coerce
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
            values[field.name] = v;
        }

        // Step d: recurse into a container's children, before validating the
        // container itself — `children` normalizes the value (clones, mints
        // missing item `_id`s), and the container's own rules should see that
        // normalized form. A scope's segments are relative to its container, so
        // this scope's parents are prepended; deeper containers accumulate.
        if (descriptor?.children !== undefined) {
            const { next, scopes } = descriptor.children(field, v);
            v = next;
            values[field.name] = next;
            for (const scope of scopes) {
                await processScope(
                    scope.values,
                    scope.definitions,
                    [...parentSegments, ...scope.segments],
                    ctx,
                    errors
                );
            }
        }

        // Step e: validate
        const messages: string[] = [];

        if (field.required === true && isEmpty(v)) {
            // Required + empty: single message, skip all other rules
            messages.push('This field is required');
        } else {
            // `min`/`max` on a container mean ITEM COUNTS, not numeric bounds —
            // checked outside the `isEmpty` guard so that `min` still fires on an
            // empty (but not required) container, which is its whole point.
            if (descriptor?.isContainer === true && Array.isArray(v)) {
                if (field.min !== undefined && v.length < field.min) {
                    messages.push(`Must have at least ${field.min} items`);
                }
                if (field.max !== undefined && v.length > field.max) {
                    messages.push(`Must have at most ${field.max} items`);
                }
            }

            if (!isEmpty(v)) {
                // Present value: run all rules, collect all messages
                const fieldCtx: FieldValidationContext = {
                    value: v,
                    // Siblings within THIS scope — a nested field's cross-field
                    // rules read its own item, not the root record.
                    values,
                    field,
                    path: segments,
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
            // else: optional + empty → no rules (valid)
        }

        if (messages.length > 0) {
            errors[path] = messages;
        }
    }
}

export async function processFields(
    values: Record<string, unknown>,
    definitions: FieldDefinition[],
    ctx: PipelineContext
): Promise<{ values: Record<string, unknown>; errors: FieldErrors }> {
    const result = { ...values };
    const errors: FieldErrors = {};
    await processScope(result, definitions, [], ctx, errors);
    return { values: result, errors };
}
