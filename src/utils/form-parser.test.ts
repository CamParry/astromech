import { describe, expect, it } from 'vitest';
import { parseFormData, formatDateForInput, formatDatetimeForInput } from '@/utils/form-parser';
import type { FieldGroup } from '@/types/index.js';

describe('parseFormData', () => {
  it('should parse text fields', () => {
    const formData = new FormData();
    formData.set('fields.body', 'Test body content');
    formData.set('fields.excerpt', 'Test excerpt');

    const fieldGroups: FieldGroup[] = [
      {
        name: 'content',
        label: 'Content',
        location: 'main',
        fields: [
          { name: 'body', type: 'text' },
          { name: 'excerpt', type: 'textarea' },
        ],
      },
    ];

    const result = parseFormData(formData, fieldGroups);
    expect(result.body).toBe('Test body content');
    expect(result.excerpt).toBe('Test excerpt');
  });

  it('should parse richtext fields', () => {
    const formData = new FormData();
    formData.set('fields.content', '<h1>Hello World</h1>\n<p>This is HTML content.</p>');

    const fieldGroups: FieldGroup[] = [
      {
        name: 'content',
        label: 'Content',
        location: 'main',
        fields: [
          { name: 'content', type: 'richtext', required: true },
        ],
      },
    ];

    const result = parseFormData(formData, fieldGroups);
    expect(result.content).toBe('<h1>Hello World</h1>\n<p>This is HTML content.</p>');
  });

  it('should parse number fields', () => {
    const formData = new FormData();
    formData.set('fields.price', '99.99');
    formData.set('fields.quantity', '5');

    const fieldGroups: FieldGroup[] = [
      {
        name: 'pricing',
        label: 'Pricing',
        location: 'main',
        fields: [
          { name: 'price', type: 'number' },
          { name: 'quantity', type: 'number' },
        ],
      },
    ];

    const result = parseFormData(formData, fieldGroups);
    expect(result.price).toBe(99.99);
    expect(result.quantity).toBe(5);
  });

  it('should parse boolean fields', () => {
    const formData = new FormData();
    formData.set('fields.featured', 'true');
    // Unchecked checkbox won't be in FormData

    const fieldGroups: FieldGroup[] = [
      {
        name: 'options',
        label: 'Options',
        location: 'main',
        fields: [
          { name: 'featured', type: 'boolean' },
          { name: 'archived', type: 'boolean' },
        ],
      },
    ];

    const result = parseFormData(formData, fieldGroups);
    expect(result.featured).toBe(true);
    expect(result.archived).toBe(false); // Default to false for unchecked
  });

  it('should parse date and datetime fields', () => {
    const formData = new FormData();
    formData.set('fields.publishDate', '2026-03-15');
    formData.set('fields.eventTime', '2026-03-15T14:30');

    const fieldGroups: FieldGroup[] = [
      {
        name: 'schedule',
        label: 'Schedule',
        location: 'main',
        fields: [
          { name: 'publishDate', type: 'date' },
          { name: 'eventTime', type: 'datetime' },
        ],
      },
    ];

    const result = parseFormData(formData, fieldGroups);
    expect(result.publishDate).toBe('2026-03-15');
    expect(result.eventTime).toBe('2026-03-15T14:30');
  });

  it('should parse select fields', () => {
    const formData = new FormData();
    formData.set('fields.status', 'published');

    const fieldGroups: FieldGroup[] = [
      {
        name: 'meta',
        label: 'Meta',
        location: 'main',
        fields: [
          {
            name: 'status',
            type: 'select',
            options: ['draft', 'published', 'archived'],
          },
        ],
      },
    ];

    const result = parseFormData(formData, fieldGroups);
    expect(result.status).toBe('published');
  });

  it('should handle empty values', () => {
    const formData = new FormData();
    formData.set('fields.optional', '');

    const fieldGroups: FieldGroup[] = [
      {
        name: 'content',
        label: 'Content',
        location: 'main',
        fields: [{ name: 'optional', type: 'text' }],
      },
    ];

    const result = parseFormData(formData, fieldGroups);
    expect(result.optional).toBeNull();
  });

  it('should parse repeater fields', () => {
    const formData = new FormData();
    formData.set('fields.gallery[0].caption', 'First image');
    formData.set('fields.gallery[0].alt', 'Alt text one');
    formData.set('fields.gallery[1].caption', 'Second image');
    formData.set('fields.gallery[1].alt', 'Alt text two');

    const fieldGroups: FieldGroup[] = [
      {
        name: 'content',
        label: 'Content',
        location: 'main',
        fields: [
          {
            name: 'gallery',
            type: 'repeater',
            fields: [
              { name: 'caption', type: 'text' },
              { name: 'alt', type: 'text' },
            ],
          },
        ],
      },
    ];

    const result = parseFormData(formData, fieldGroups);
    expect(result.gallery).toEqual([
      { caption: 'First image', alt: 'Alt text one' },
      { caption: 'Second image', alt: 'Alt text two' },
    ]);
  });

  it('should handle multiple field groups', () => {
    const formData = new FormData();
    formData.set('fields.title', 'Test');
    formData.set('fields.category', 'news');

    const fieldGroups: FieldGroup[] = [
      {
        name: 'content',
        label: 'Content',
        location: 'main',
        fields: [{ name: 'title', type: 'text' }],
      },
      {
        name: 'taxonomy',
        label: 'Taxonomy',
        location: 'sidebar',
        fields: [{ name: 'category', type: 'text' }],
      },
    ];

    const result = parseFormData(formData, fieldGroups);
    expect(result.title).toBe('Test');
    expect(result.category).toBe('news');
  });
});

describe('formatDateForInput', () => {
  it('should format ISO date strings', () => {
    const result = formatDateForInput('2026-03-15T10:30:00.000Z');
    expect(result).toBe('2026-03-15');
  });

  it('should handle Date objects', () => {
    const date = new Date('2026-03-15T10:30:00.000Z');
    const result = formatDateForInput(date);
    expect(result).toBe('2026-03-15');
  });

  it('should handle empty values', () => {
    expect(formatDateForInput(null)).toBe('');
    expect(formatDateForInput(undefined)).toBe('');
    expect(formatDateForInput('')).toBe('');
  });

  it('should handle invalid dates', () => {
    expect(formatDateForInput('invalid')).toBe('');
  });
});

describe('formatDatetimeForInput', () => {
  it('should format ISO datetime strings', () => {
    const result = formatDatetimeForInput('2026-03-15T10:30:00.000Z');
    expect(result).toBe('2026-03-15T10:30');
  });

  it('should handle Date objects', () => {
    const date = new Date('2026-03-15T10:30:00.000Z');
    const result = formatDatetimeForInput(date);
    expect(result).toBe('2026-03-15T10:30');
  });

  it('should handle empty values', () => {
    expect(formatDatetimeForInput(null)).toBe('');
    expect(formatDatetimeForInput(undefined)).toBe('');
    expect(formatDatetimeForInput('')).toBe('');
  });

  it('should handle invalid dates', () => {
    expect(formatDatetimeForInput('invalid')).toBe('');
  });
});
