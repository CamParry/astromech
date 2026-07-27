import { ZodIssueCode, type ZodIssue } from 'zod';
import type { FieldErrors } from '@/types/fields.js';

export class ValidationError extends Error {
    public readonly issues: ZodIssue[];
    /**
     * Pre-built per-field errors from the field-processing pipeline, already in
     * the `422 details.fields` shape. When present, the HTTP layer uses these
     * directly instead of deriving them from `issues`.
     */
    public readonly fields?: FieldErrors | undefined;

    constructor(issues: ZodIssue[], fields?: FieldErrors) {
        super('Validation failed');
        this.name = 'ValidationError';
        this.issues = issues;
        this.fields = fields;
    }

    /**
     * Build a ValidationError from the field pipeline's per-field error map.
     * Synthesises matching `issues` (custom code, single-segment path) so any
     * consumer reading `.issues` stays consistent with `.fields`.
     */
    static fromFieldErrors(fields: FieldErrors): ValidationError {
        const issues: ZodIssue[] = Object.entries(fields).flatMap(([key, messages]) =>
            messages.map((message) => ({
                code: ZodIssueCode.custom,
                path: [key],
                message,
            }))
        ) as ZodIssue[];
        return new ValidationError(issues, fields);
    }
}
