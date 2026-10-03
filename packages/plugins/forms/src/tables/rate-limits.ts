/**
 * The submission rate limit's counts, one row per connecting address and form.
 * Times are epoch milliseconds, so the window arithmetic stays in SQL.
 */

import { definePluginTable } from 'astromech';
import { FORMS_PACKAGE } from '../types';

export const rateLimitsTable = definePluginTable(
    FORMS_PACKAGE,
    'rate_limits',
    ({ col }) => ({
        // Minted by the repository's upsert, which writes past the column defaults.
        id: col.id({ format: 'uuid' }),
        address: col.text({ notNull: true }),
        formId: col.text({ notNull: true }),
        windowStart: col.integer({ notNull: true }),
        count: col.integer({ notNull: true }),
    }),
    ({ index }) => [
        index('idx_rate_limits_address_form_id', ['address', 'formId'], { unique: true }),
        index('idx_rate_limits_window_start', ['windowStart']),
    ]
);
