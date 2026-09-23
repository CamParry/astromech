import { describe, expect, it } from 'vitest';
import { fieldNameToLabel } from '@/utilities/labels';

describe('fieldNameToLabel', () => {
    it('converts snake_case to Title Case', () => {
        expect(fieldNameToLabel('featured_image')).toBe('Featured Image');
        expect(fieldNameToLabel('meta_title')).toBe('Meta Title');
        expect(fieldNameToLabel('og_image')).toBe('Og Image');
        expect(fieldNameToLabel('custom_css')).toBe('Custom Css');
    });

    it('converts camelCase to Title Case', () => {
        expect(fieldNameToLabel('firstName')).toBe('First Name');
        expect(fieldNameToLabel('lastName')).toBe('Last Name');
        expect(fieldNameToLabel('contactEmail')).toBe('Contact Email');
    });

    it('handles single words', () => {
        expect(fieldNameToLabel('title')).toBe('Title');
        expect(fieldNameToLabel('body')).toBe('Body');
        expect(fieldNameToLabel('slug')).toBe('Slug');
    });

    it('handles already formatted text', () => {
        expect(fieldNameToLabel('Featured Image')).toBe('Featured Image');
    });

    it('handles mixed snake_case and camelCase', () => {
        expect(fieldNameToLabel('featured_imageName')).toBe('Featured Image Name');
    });

    it('handles acronyms and consecutive capitals better', () => {
        expect(fieldNameToLabel('SEOTitle')).toBe('SEO Title');
        expect(fieldNameToLabel('APIKey')).toBe('API Key');
    });
});
