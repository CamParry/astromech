import type { ZodIssue } from 'zod';

export class ValidationError extends Error {
    public readonly issues: ZodIssue[];

    constructor(issues: ZodIssue[]) {
        super('Validation failed');
        this.name = 'ValidationError';
        this.issues = issues;
    }
}
