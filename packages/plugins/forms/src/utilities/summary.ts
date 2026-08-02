/** The submission list's one human-readable column. */

import type { FieldDefinition } from 'astromech';
import { toValueRows } from './values.js';

const SUMMARY_MAX_LENGTH = 120;
const SUMMARY_SEPARATOR = ' · ';
const SUMMARY_ROWS = 3;

/**
 * A human-scannable rendering of a submission for the list column, since no
 * cell kind can summarise a JSON blob.
 */
export function buildSummary(
    definitions: FieldDefinition[],
    values: Record<string, unknown>
): string {
    const text = toValueRows(definitions, values)
        .slice(0, SUMMARY_ROWS)
        .map((row) => `${row.label}: ${row.value}`)
        .join(SUMMARY_SEPARATOR);
    if (text.length <= SUMMARY_MAX_LENGTH) return text;
    return `${text.slice(0, SUMMARY_MAX_LENGTH - 1)}…`;
}
