import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/errors/validation';

describe('ValidationError.fromFieldErrors', () => {
    it('exposes the per-field map verbatim on .fields', () => {
        const fields = { title: ['This field is required'], slug: ['Already in use'] };
        const err = ValidationError.fromFieldErrors(fields);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.fields).toEqual(fields);
        expect(err.message).toBe('Validation failed');
    });

    it('synthesises matching issues (one per message, single-segment path)', () => {
        const err = ValidationError.fromFieldErrors({
            email: ['Must be a valid email address'],
            tags: ['Must be at least 1 characters', 'Already in use'],
        });
        expect(err.issues).toHaveLength(3);
        const emailIssue = err.issues.find((i) => i.path.join('.') === 'email');
        expect(emailIssue?.message).toBe('Must be a valid email address');
        const tagIssues = err.issues.filter((i) => i.path.join('.') === 'tags');
        expect(tagIssues.map((i) => i.message)).toEqual([
            'Must be at least 1 characters',
            'Already in use',
        ]);
    });

    it('round-trips the details.fields shape through issues (path.join matches the key)', () => {
        const fields = { author: ['Already in use'] };
        const err = ValidationError.fromFieldErrors(fields);
        const derived: Record<string, string[]> = {};
        for (const issue of err.issues) {
            const key = issue.path.join('.') || '_';
            (derived[key] ??= []).push(issue.message);
        }
        expect(derived).toEqual(fields);
    });
});
