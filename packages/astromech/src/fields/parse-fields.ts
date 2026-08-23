/**
 * The field pipeline runs each field through coerce, then default, then
 * validate, recursing into nested containers via `children`. Validation splits
 * along `ctx.validation`: completeness only when `'complete'`; correctness always.
 */

import type {
    Field,
    FieldErrors,
    FieldPathSegment,
    FieldType,
    FieldValidationContext,
    ResourceValidator,
    ValidationMode,
    ValidationRule,
} from '@/types/fields';
import { ValidationError } from '@/errors/validation';
import { formatInstancePath, isValidFieldName } from './field-path';
import { getFieldType } from './field-type-registry';
import { flattenFieldNodes } from './flatten';
import { projectToSchema } from './values';

function isEmpty(v: unknown): boolean {
    return (
        v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
    );
}

/**
 * A field whose name breaks the path grammar has nowhere to put its errors, so
 * this is a schema error and failing loudly is correct. Checked here, rather than
 * left to the formatter, so the message names the offending field instead of
 * surfacing as a bare path error from deep in the stack.
 */
function fieldErrorPath(segments: readonly FieldPathSegment[], field: Field): string {
    if (!isValidFieldName(field.name)) {
        const reason =
            field.name === ''
                ? 'field names must not be empty'
                : "field names must not contain '.', '[' or ']'";
        throw new Error(
            `Field name '${field.name}' (type '${field.type}') cannot be used: ${reason}`
        );
    }
    return formatInstancePath(segments);
}

// A rule that cannot judge the value it was given reports the mismatch rather
// than passing. The field type's own validator normally catches this first, so
// these fire only for a type that has no validator of its own.
const NOT_TEXT = 'Must be text';
const NOT_A_NUMBER = 'Must be a number';
const NOT_MEASURABLE = 'Must be text or a list';

/** Values with a meaningful `length` for the length rules. */
function isMeasurable(value: unknown): value is string | unknown[] {
    return typeof value === 'string' || Array.isArray(value);
}

async function runRule(
    rule: ValidationRule,
    ctx: FieldValidationContext
): Promise<string | null> {
    const { value } = ctx;

    if ('minLength' in rule) {
        if (!isMeasurable(value)) return NOT_MEASURABLE;
        if (value.length < rule.minLength) {
            return `Must be at least ${rule.minLength} characters`;
        }
        return null;
    }

    if ('maxLength' in rule) {
        if (!isMeasurable(value)) return NOT_MEASURABLE;
        if (value.length > rule.maxLength) {
            return `Must be at most ${rule.maxLength} characters`;
        }
        return null;
    }

    if ('min' in rule) {
        if (typeof value !== 'number') return NOT_A_NUMBER;
        if (value < rule.min) return `Must be at least ${rule.min}`;
        return null;
    }

    if ('max' in rule) {
        if (typeof value !== 'number') return NOT_A_NUMBER;
        if (value > rule.max) return `Must be at most ${rule.max}`;
        return null;
    }

    if ('pattern' in rule) {
        if (typeof value !== 'string') return NOT_TEXT;
        if (!new RegExp(rule.pattern).test(value)) {
            return rule.message ?? 'Invalid format';
        }
        return null;
    }

    if ('email' in rule) {
        if (typeof value !== 'string') return NOT_TEXT;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return 'Must be a valid email address';
        }
        return null;
    }

    if ('url' in rule) {
        if (typeof value !== 'string') return NOT_TEXT;
        try {
            new URL(value);
        } catch {
            return 'Must be a valid URL';
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
        const isUniq = await ctx.lookups.isUnique(ctx.field, value);
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

/**
 * The caller-supplied half of the validation context — everything not per-field.
 * `validation` and `collectWarnings` are optional for callers and concrete inside
 * (see `safeParseFields`).
 */
type ParseContext = Omit<
    FieldValidationContext,
    'value' | 'values' | 'field' | 'path' | 'validation'
> & {
    validation?: ValidationMode;
    /** Evaluate warning-severity rules. Default `false`. */
    collectWarnings?: boolean;
    /** Whole-resource validator, run after every field. */
    validate?: ResourceValidator;
    /**
     * Root field names whose value is new in this write. Absent ⇒ coerce
     * everything; present ⇒ coerce only these fields and their subtrees.
     */
    coerceOnly?: ReadonlySet<string>;
};

/** The same context once `validation` and `collectWarnings` are concrete. */
type ScopeContext = Omit<
    FieldValidationContext,
    'value' | 'values' | 'field' | 'path'
> & { collectWarnings: boolean; coerceOnly?: ReadonlySet<string> };

/** At most one message of each severity, which is what a field's checks report. */
type FieldChecks = { error: string | null; warning: string | null };

/**
 * Completeness: has the field been filled in? Runs only for a `'complete'`
 * write, so a `'partial'` one can save a half-finished draft. Returns the
 * field's error message, or `null`.
 */
function checkCompleteness(
    field: Field,
    fieldType: FieldType | undefined,
    value: unknown,
    ctx: ScopeContext
): string | null {
    if (ctx.validation !== 'complete') return null;

    if (field.required === true && isEmpty(value)) return 'This field is required';

    // `min` on a container means an ITEM COUNT, not a numeric bound — checked
    // outside the `isEmpty` guard so that it still fires on an empty (but not
    // required) container, which is its whole point.
    if (
        fieldType?.children !== undefined &&
        Array.isArray(value) &&
        field.min !== undefined &&
        value.length < field.min
    ) {
        return `Must have at least ${field.min} items`;
    }

    return null;
}

/**
 * Correctness: is what the field holds valid? Runs on every write, draft
 * included. The checks below run in a fixed order and the FIRST failure of each
 * severity wins.
 */
async function checkCorrectness(
    field: Field,
    fieldType: FieldType | undefined,
    fieldCtx: FieldValidationContext,
    ctx: ScopeContext
): Promise<FieldChecks> {
    const value = fieldCtx.value;

    // `max` on a container means an ITEM COUNT, not a numeric bound — checked
    // outside the `isEmpty` guard, alongside `min`. Correctness rather than
    // completeness, so no draft save stores more items than the type permits.
    if (
        fieldType?.children !== undefined &&
        Array.isArray(value) &&
        field.max !== undefined &&
        value.length > field.max
    ) {
        return { error: `Must have at most ${field.max} items`, warning: null };
    }

    // Optional + empty → no rules (valid).
    if (isEmpty(value)) return { error: null, warning: null };

    // The type's own validator, BEFORE the author's rules: an author rule ("must
    // be on example.com") cannot be evaluated against a value that is not even a
    // URL, so reporting it first sends the author chasing the wrong problem.
    if (fieldType?.validate) {
        const r = await fieldType.validate(fieldCtx);
        if (r !== true) return { error: r, warning: null };
    }

    // Author-supplied declarative rules, in declaration order, and only over a
    // value the type itself accepted — including the warning-severity ones.
    let error: string | null = null;
    let warning: string | null = null;
    for (const rule of field.validation ?? []) {
        const severity = rule.severity ?? 'error';
        // Each severity keeps only its FIRST message, so a rule whose slot is
        // already filled is skipped without being evaluated.
        if (severity === 'error' ? error !== null : warning !== null) continue;
        if (severity === 'warning' && !ctx.collectWarnings) continue;
        const msg = await runRule(rule, fieldCtx);
        if (msg === null) continue;
        if (severity === 'error') error = msg;
        else warning = msg;
    }

    return { error, warning };
}

/**
 * Run one value scope: the root record, or one container item / group object.
 * `values` is mutated in place, because a nested scope object is a live
 * reference inside the container value already written to its parent.
 *
 * `inheritedCoercible` is the parent field's coercibility, or `undefined` at the
 * root scope where `ctx.coerceOnly` decides it per field.
 */
async function processScope(
    values: Record<string, unknown>,
    definitions: Field[],
    parentSegments: readonly FieldPathSegment[],
    ctx: ScopeContext,
    errors: FieldErrors,
    warnings: FieldErrors,
    inheritedCoercible?: boolean
): Promise<void> {
    for (const field of flattenFieldNodes(definitions)) {
        const fieldType = getFieldType(field.type);
        const segments: FieldPathSegment[] = [
            ...parentSegments,
            { kind: 'field', name: field.name },
        ];
        const path = fieldErrorPath(segments, field);

        // A patched root container replaces its whole subtree, so every value
        // below it is new too and inherits the container's coercibility.
        const coercible =
            inheritedCoercible ??
            (ctx.coerceOnly === undefined || ctx.coerceOnly.has(field.name));

        // Step a: coerce
        let v =
            coercible && fieldType?.coerce
                ? fieldType.coerce(values[field.name])
                : values[field.name];

        // Step b: default (create only, when value is absent)
        if (ctx.operation === 'create' && (v === undefined || v === null)) {
            if (field.defaultValue !== undefined) {
                v = field.defaultValue;
            } else if (fieldType?.defaultValue !== undefined) {
                v = fieldType.defaultValue;
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
        if (fieldType?.children !== undefined) {
            const { next, scopes } = fieldType.children(field, v);
            v = next;
            values[field.name] = next;
            for (const scope of scopes) {
                await processScope(
                    scope.values,
                    scope.definitions,
                    [...parentSegments, ...scope.segments],
                    ctx,
                    errors,
                    warnings,
                    coercible
                );
            }
        }

        // Step e: validate. Completeness runs first, and its failure skips the
        // correctness checks and the warnings with them — a field the author has
        // not filled in should not also be nagged about.
        let error: string | null = checkCompleteness(field, fieldType, v, ctx);
        let warning: string | null = null;

        if (error === null) {
            const fieldCtx: FieldValidationContext = {
                value: v,
                // Siblings within THIS scope — a nested field's cross-field
                // rules read its own item, not the root record.
                values,
                field,
                path: segments,
                operation: ctx.operation,
                validation: ctx.validation,
                resource: ctx.resource,
                user: ctx.user,
                lookups: ctx.lookups,
            };
            ({ error, warning } = await checkCorrectness(
                field,
                fieldType,
                fieldCtx,
                ctx
            ));
        }

        // `FieldErrors` stays `Record<string, string[]>` on the wire; the array
        // simply carries the one message. Warnings key by the same path.
        if (error !== null) {
            errors[path] = [error];
        }
        if (warning !== null) {
            warnings[path] = [warning];
        }
    }
}

/** What `safeParseFields` reports: the coerced values and everything that failed. */
export type ParsedFields = {
    values: Record<string, unknown>;
    errors: FieldErrors;
    warnings: FieldErrors;
    form: string[];
};

/**
 * Run every field definition over `fields`, then the resource validator, and
 * return the coerced values — throwing a 422 if anything reported. Warnings are
 * advisory and never block a write, so they are dropped here.
 */
export async function parseFields(
    fields: Record<string, unknown>,
    definitions: Field[],
    ctx: ParseContext
): Promise<Record<string, unknown>> {
    const parsed = await safeParseFields(fields, definitions, ctx);
    assertNoFieldErrors(parsed);
    return parsed.values;
}

/**
 * The same parse, returning everything that reported instead of throwing: the
 * coerced values plus blocking `errors`, advisory `warnings` and form-level
 * `form` messages.
 *
 * The returned values are projected through the schema first, so a key matching
 * no declared field is dropped rather than written back. Empty `definitions`
 * means the schema is unknown here, not that there are no fields, so nothing is
 * dropped in that case.
 */
export async function safeParseFields(
    fields: Record<string, unknown>,
    definitions: Field[],
    ctx: ParseContext
): Promise<ParsedFields> {
    const declared = flattenFieldNodes(definitions);
    // `projectToSchema` hands back its input when the schema is unknown, and the
    // parse mutates what it is given, so that case still needs a copy.
    const result =
        declared.length === 0 ? { ...fields } : projectToSchema(fields, declared);
    const errors: FieldErrors = {};
    const warnings: FieldErrors = {};
    // Default to `'complete'`, i.e. today's behaviour: media, users and settings
    // have no draft concept, so completeness must keep applying to them.
    const validation: ValidationMode = ctx.validation ?? 'complete';
    const collectWarnings = ctx.collectWarnings ?? false;
    await processScope(
        result,
        definitions,
        [],
        { ...ctx, validation, collectWarnings },
        errors,
        warnings
    );

    // The resource validator runs whether or not the fields reported, so one
    // pass surfaces cross-field and per-field problems together.
    const form: string[] = [];
    if (ctx.validate) {
        const reported = await ctx.validate({
            values: result,
            definitions,
            operation: ctx.operation,
            validation,
            resource: ctx.resource,
            user: ctx.user,
            lookups: ctx.lookups,
        });
        if (typeof reported === 'string') {
            if (reported !== '') form.push(reported);
        } else if (reported !== null && typeof reported === 'object') {
            for (const [path, message] of Object.entries(reported)) {
                // A field's own error is more specific, so it wins the key.
                if (errors[path] === undefined) errors[path] = [message];
            }
        }
    }

    return { values: result, errors, warnings, form };
}

/** Throws the parsed result's field and form errors as a 422. */
function assertNoFieldErrors(parsed: ParsedFields): void {
    if (Object.keys(parsed.errors).length > 0 || parsed.form.length > 0) {
        throw ValidationError.fromFieldErrors(parsed.errors, parsed.form);
    }
}
