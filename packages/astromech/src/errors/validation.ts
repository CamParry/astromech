import { ZodIssueCode, type ZodIssue } from 'zod';
import type { FieldErrors } from '@/types/fields';

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
        super('Validation failed');
        this.name = 'ValidationError';
        this.issues = issues;
        this.fields = fields;
        this.form = form;
    }

    /**
     * Build a ValidationError from the field pipeline's per-field error map plus
     * any form-level messages. Synthesises matching `issues` (custom code,
     * single-segment path; empty path for a form message, which belongs to no
     * field) so any consumer reading `.issues` stays consistent.
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
