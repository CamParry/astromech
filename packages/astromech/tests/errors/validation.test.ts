import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fieldErrorsFromIssues, ValidationError } from '@/errors/validation';

describe('ValidationError.fromFieldErrors', () => {
    it('exposes the per-field map verbatim on .fields', () => {
        const fields = { title: ['This field is required'], slug: ['Already in use'] };
        const err = ValidationError.fromFieldErrors(fields);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.fields).toEqual(fields);
        expect(err.message).toBe(
            'Validation failed:\n  title: This field is required\n  slug: Already in use'
        );
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

describe('ValidationError message', () => {
    it('lists each form message, then each field message, by path', () => {
        const err = ValidationError.fromFieldErrors({ role: ['Unknown role'] }, [
            'Whole-resource rule failed.',
        ]);
        expect(err.message).toBe(
            'Validation failed:\n  Whole-resource rule failed.\n  role: Unknown role'
        );
    });

    it('is the bare phrase when nothing names a field', () => {
        expect(new ValidationError([]).message).toBe('Validation failed');
    });
});

describe('fieldErrorsFromIssues', () => {
    const issuesOf = (schema: z.ZodType, value: unknown) => {
        const parsed = schema.safeParse(value);
        if (parsed.success) expect.unreachable('expected the parse to fail');
        return parsed.error.issues;
    };

    it('keys each unknown key under its own path, at any depth', () => {
        const schema = z.strictObject({ data: z.strictObject({ title: z.string() }) });
        const issues = issuesOf(schema, { extra: 1, data: { title: 'A', body: 'B' } });

        expect(fieldErrorsFromIssues(issues)).toEqual({
            extra: ['Unknown key'],
            'data.body': ['Unknown key'],
        });
    });

    it('leaves `prefix` off the front of each path', () => {
        const schema = z.strictObject({ data: z.strictObject({ title: z.string() }) });
        const issues = issuesOf(schema, { data: { data: { title: 'A' } } });

        expect(fieldErrorsFromIssues(issues, 'data')).toEqual({
            data: ['Unknown key'],
            title: ['Invalid input: expected string, received undefined'],
        });
    });

    it('keys an issue about the whole input under `_`', () => {
        expect(fieldErrorsFromIssues(issuesOf(z.strictObject({}), 'x'))).toEqual({
            _: ['Invalid input: expected object, received string'],
        });
    });
});
