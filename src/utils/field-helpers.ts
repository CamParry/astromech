import { startCase } from 'lodash-es';

/**
 * Converts a field name to title case for display using lodash startCase
 * Examples:
 *   'featured_image' -> 'Featured Image'
 *   'firstName' -> 'First Name'
 *   'meta_title' -> 'Meta Title'
 *   'SEOTitle' -> 'SEO Title'
 */
export function fieldNameToLabel(name: string): string {
  return startCase(name);
}

/**
 * Gets a display label for a field, using the label if provided,
 * otherwise converting the field name to title case
 */
export function getFieldLabel(field: { name: string; label?: string }): string {
  return field.label || fieldNameToLabel(field.name);
}
