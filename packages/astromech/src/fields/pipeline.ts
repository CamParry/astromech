/**
 * Field-processing pipeline — coerce → default → validate.
 *
 * Pure logic: no domain/DB imports. The `reads` handle on `ctx` is the
 * injection point for any async checks (uniqueness, references).
 *
 * Public API via `astromech/fields` (`parseFields`). Entries is not its
 * only consumer: any plugin that composes `Field[]` at runtime can
 * validate through the same coerce → default → validate path as core.
 *
 * Nested fields (group/repeater/blocks/tree) are recursed into: a field type
 * with a `children` slot reports its nested value scopes, each of which is run
 * through the same coerce → default → validate pass. Errors are keyed by the
 * `_id`-based path grammar (`fields/field-path.ts`), so a nested error lands on
 * `sections[a1].items[b2].title` and a top-level one stays the bare field name.
 * Nothing here switches on field type.
 *
 * Validation splits in two along `ctx.validation`. COMPLETENESS — `required` and a
 * container's `min` item count — answers "is this finished?" and runs only when
 * `'complete'`, so a draft save can leave work half-done. CORRECTNESS —
 * everything else, including a container's `max` — answers "is what you typed
 * valid?" and runs on every write, because storing a malformed URL is a
 * data-integrity problem rather than an incomplete one.
 *
 * A field reports at most ONE message. The checks short-circuit in the order
 * `required` → container item counts → the type's own `validate` →
 * the author's declarative `field.validation` rules (in declaration order). The
 * type's validator precedes the author's rules because an author rule ("must be
 * on example.com") is unevaluable against a value that is not even a URL.
 * `FieldErrors` is still `Record<string, string[]>` on the wire — the array just
 * carries one entry.
 *
 * An author rule carries a `severity`. `'error'` (the default) files into
 * `errors` and blocks the write; `'warning'` files into `warnings` and does not.
 * A field can report one of each, in the same fixed order and under the same
 * path key. `required`, container item counts and the type's own validator are
 * error-only. Warnings are evaluated only when `ctx.collectWarnings` is set:
 * a `{ unique: true, severity: 'warning' }` rule costs a database read and the
 * server has no consumer for the result — only the editor does.
 *
 * `ctx.resourceValidate` runs last, over the coerced values, whether or not the
 * fields reported. It returns a form-level string or a map of path → message;
 * on a key a field already claimed, the field's own error wins as the more
 * specific one.
 *
 * The values the pipeline returns hold only keys the schema declares: a key
 * belonging to no declared field is dropped, silently, because it has no field
 * to report an error against and a PATCH-merge write would otherwise carry it
 * forever.
 *
 * `ctx.coerceOnly` names the root fields a patch actually carries. Coercion then
 * runs for those fields and their subtrees only, while defaults, `children()`
 * normalization and validation still run over the whole merged resource. A
 * coercer is not guaranteed idempotent, so re-running one over a value the
 * caller never mentioned would rewrite stored data behind their back.
 */

import type {
    Field,
    FieldErrors,
    FieldPathSegment,
    FieldValidationContext,
    ResourceValidator,
    ValidationRule,
    ValidationMode,
} from '@/types/fields';
import { getFieldType } from './field-type-registry';
import { formatInstancePath, isValidFieldName } from './field-path';
import { flattenFieldNodes } from './flatten';
import { projectToSchema } from './values';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Rule runner
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * The caller-supplied half of the validation context — everything not per-field.
 * `validation` and `collectWarnings` are optional for callers and concrete inside
 * (see `parseFields`).
 */
type PipelineContext = Omit<
    FieldValidationContext,
    'value' | 'values' | 'field' | 'path' | 'validation'
> & {
    validation?: ValidationMode;
    /** Evaluate warning-severity rules. Default `false`. */
    collectWarnings?: boolean;
    /** Whole-resource validator, run after every field. */
    resourceValidate?: ResourceValidator;
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

        // Step e: validate. One message per severity — the checks below run in
        // a fixed order and the FIRST failure of each severity wins.
        let error: string | null = null;
        let warning: string | null = null;

        if (ctx.validation === 'complete' && field.required === true && isEmpty(v)) {
            // 1. Required + empty: skips all other rules, warnings included — a
            // field the author has not filled in should not also be nagged
            // about. A completeness check, so a `'partial'` write never reaches
            // this branch.
            error = 'This field is required';
        } else {
            // 2. `min`/`max` on a container mean ITEM COUNTS, not numeric bounds
            // — checked outside the `isEmpty` guard so that `min` still fires on
            // an empty (but not required) container, which is its whole point.
            // `min` is completeness (complete only); `max` is correctness, so it
            // runs on a draft save too — no write should store more items than
            // the type permits.
            if (fieldType?.children !== undefined && Array.isArray(v)) {
                if (
                    ctx.validation === 'complete' &&
                    field.min !== undefined &&
                    v.length < field.min
                ) {
                    error = `Must have at least ${field.min} items`;
                } else if (field.max !== undefined && v.length > field.max) {
                    error = `Must have at most ${field.max} items`;
                }
            }

            if (error === null && !isEmpty(v)) {
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

                // 3. The type's own validator, BEFORE the author's rules: an
                // author rule ("must be on example.com") cannot be evaluated
                // against a value that is not even a URL, so reporting it first
                // sends the author chasing the wrong problem.
                if (fieldType?.validate) {
                    const r = await fieldType.validate(fieldCtx);
                    if (r !== true) error = r;
                }

                // 4. Author-supplied declarative rules, in declaration order,
                // and only over a value the type itself accepted — including
                // the warning-severity ones.
                if (error === null) {
                    for (const rule of field.validation ?? []) {
                        const severity = rule.severity ?? 'error';
                        // Each severity keeps only its FIRST message, so a rule
                        // whose slot is already filled is skipped without being
                        // evaluated.
                        if (severity === 'error' ? error !== null : warning !== null)
                            continue;
                        if (severity === 'warning' && !ctx.collectWarnings) continue;
                        const msg = await runRule(rule, fieldCtx);
                        if (msg === null) continue;
                        if (severity === 'error') error = msg;
                        else warning = msg;
                    }
                }
            }
            // else: optional + empty → no rules (valid)
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

/**
 * Run every field definition over `fields`, then the resource validator.
 * Returns the coerced values plus blocking `errors`, advisory `warnings` and
 * form-level `form` messages.
 *
 * The returned values are projected through the schema first, so a key matching
 * no declared field is dropped rather than written back. Empty `definitions`
 * means the schema is unknown here, not that there are no fields, so nothing is
 * dropped in that case.
 */
export async function parseFields(
    fields: Record<string, unknown>,
    definitions: Field[],
    ctx: PipelineContext
): Promise<{
    values: Record<string, unknown>;
    errors: FieldErrors;
    warnings: FieldErrors;
    form: string[];
}> {
    const declared = flattenFieldNodes(definitions);
    // `projectToSchema` hands back its input when the schema is unknown, and the
    // pipeline mutates what it is given, so that case still needs a copy.
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
    if (ctx.resourceValidate) {
        const reported = await ctx.resourceValidate({
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
