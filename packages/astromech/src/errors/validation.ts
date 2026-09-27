import type { FieldErrors } from '@/types/fields';
import type { ZodIssue, ZodType } from 'zod';
import { ZodError, ZodIssueCode } from 'zod';

/** Thrown for a failed field/resource validation; the shape the 422 handler reads. */
export class ValidationError extends Error {
    public readonly issues: ZodIssue[];
    /**
     * Pre-built per-field errors from the field-processing pipeline, already in
     * the `422 details.fields` shape. When present, the HTTP layer uses these
     * directly instead of deriving them from `issues`.
     */
    public readonly fields?: FieldErrors | undefined;
    /**
     * Form-level messages from the resource validator — problems that belong to
     * no single field. Surfaced as `422 details.form`.
     */
    public readonly form?: string[] | undefined;

    constructor(issues: ZodIssue[], fields?: FieldErrors, form?: string[]) {
        super(describeFailure(fields ?? fieldErrorsFromIssues(issues), form));
        this.name = 'ValidationError';
        this.issues = issues;
        this.fields = fields;
        this.form = form;
    }

    /**
     * Build a ValidationError from the field pipeline's per-field error map
     * plus form-level messages. Synthesises matching `issues` so any
     * consumer reading `.issues` stays consistent.
     */
    static fromFieldErrors(fields: FieldErrors, form?: string[]): ValidationError {
        const issues: ZodIssue[] = [
            ...Object.entries(fields).flatMap(([key, messages]) =>
                messages.map((message) => ({
                    code: ZodIssueCode.custom,
                    path: [key],
                    message,
                }))
            ),
            ...(form ?? []).map((message) => ({
                code: ZodIssueCode.custom,
                path: [],
                message,
            })),
        ] as ZodIssue[];
        return new ValidationError(issues, fields, form);
    }
}

/**
 * The per-field messages `issues` report, keyed by dotted path, with `_` for
 * the input as a whole. An unknown key is reported under its own path, so a
 * caller learns which key to drop. `prefix` is a leading key left off each path.
 */
export function fieldErrorsFromIssues(
    issues: readonly ZodIssue[],
    prefix?: string
): FieldErrors {
    const fields: FieldErrors = {};
    const add = (path: readonly PropertyKey[], message: string): void => {
        const reported =
            prefix !== undefined && path[0] === prefix ? path.slice(1) : path;
        const key = reported.map(String).join('.') || '_';
        (fields[key] ??= []).push(message);
    };
    for (const issue of issues) {
        if (issue.code === ZodIssueCode.unrecognized_keys) {
            for (const key of issue.keys) add([...issue.path, key], 'Unknown key');
        } else {
            add(issue.path, issue.message);
        }
    }
    return fields;
}

/**
 * The error's message: "Validation failed", then each form message and each
 * `field: message`, so a caller reading only the message (a tool result, the
 * CLI, a log) can still correct the call. The HTTP body keeps the bare phrase.
 */
function describeFailure(fields: FieldErrors, form: readonly string[] = []): string {
    const lines = [
        ...form,
        ...Object.entries(fields).flatMap(([field, messages]) =>
            messages.map((message) => `${field}: ${message}`)
        ),
    ];
    if (lines.length === 0) return 'Validation failed';
    return `Validation failed:\n${lines.map((line) => `  ${line}`).join('\n')}`;
}

/**
 * Parse request input with a zod `schema`, rethrowing a zod failure as the
 * framework's 422. The envelope-level counterpart to the field pipeline's
 * `parseFields`: this one checks what the caller sent around the fields
 * (title, slug, status), that one checks the field values themselves.
 */
export function parseInput<T>(schema: ZodType<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (err) {
        if (err instanceof ZodError) throw new ValidationError(err.issues);
        throw err;
    }
}
