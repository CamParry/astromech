import type { FieldGroup, FieldDefinition, JsonObject, JsonValue } from '@/types/index.js';
import { ENTITY_LEVEL_FIELDS } from '@/admin/config/field-config';
import { parseValueFromInput } from '@/utils/field-formatters';

/**
 * Parses FormData and extracts custom fields with type coercion
 *
 * @param formData - The FormData from form submission
 * @param fieldGroups - Field group definitions from collection config
 * @returns Object with custom field values, properly type-coerced
 */
export function parseFormData(
  formData: FormData,
  fieldGroups: FieldGroup[]
): JsonObject {
  const fields: JsonObject = {};

  // Iterate through all field definitions
  for (const group of fieldGroups) {
    for (const field of group.fields) {
      // Skip entity-level fields (they're handled separately at the entity level)
      if ((ENTITY_LEVEL_FIELDS as readonly string[]).includes(field.name)) {
        continue;
      }

      const key = `fields.${field.name}`;

      if (field.type === 'repeater') {
        const subFields = field.fields || [];
        const prefix = `${key}[`;

        // Find max index present in FormData
        let maxIndex = -1;
        for (const formKey of formData.keys()) {
          if (formKey.startsWith(prefix)) {
            const match = formKey.match(/\[(\d+)\]/);
            if (match) {
              const idx = parseInt(match[1]!, 10);
              if (idx > maxIndex) maxIndex = idx;
            }
          }
        }

        if (maxIndex >= 0) {
          const itemsArray: JsonObject[] = [];
          for (let i = 0; i <= maxIndex; i++) {
            const item: JsonObject = {};
            for (const subField of subFields) {
              const subKey = `${key}[${i}].${subField.name}`;
              if (subField.type === 'relationship' || subField.type === 'multiselect') {
                const vals = formData.getAll(subKey).filter(v => typeof v === 'string' && v !== '') as string[];
                item[subField.name] = subField.multiple || subField.type === 'multiselect' ? vals : vals[0] ?? null;
              } else {
                const raw = formData.get(subKey);
                item[subField.name] = raw instanceof File ? null : parseValueFromInput(raw, subField.type) as JsonValue;
              }
            }
            itemsArray.push(item);
          }
          fields[field.name] = itemsArray;
        } else {
          fields[field.name] = [];
        }
      } else if (field.type === 'relationship' || field.type === 'multiselect') {
        // Handle relation and multiselect fields (can have multiple values)
        const rawValues = formData.getAll(key);
        const values = rawValues.filter(v => typeof v === 'string' && v !== '') as string[];

        if (field.multiple || field.type === 'multiselect') {
          fields[field.name] = values;
        } else {
          fields[field.name] = values[0] || null;
        }
      } else {
        // For other field types, use the standard parser
        const rawValue = formData.get(key);
        if (rawValue instanceof File) {
          fields[field.name] = null;
        } else {
          fields[field.name] = parseValueFromInput(rawValue, field.type) as JsonValue;
        }
      }
    }
  }

  return fields;
}

// Date formatting functions are now deprecated and moved to field-formatters.ts
// Re-export them here for backward compatibility
export { formatDateForInput, formatDatetimeForInput } from '@/utils/field-formatters';
