/**
 * @astromech/forms — forms with runtime-composed fields, a public submission
 * API, and spam protection. The `form` entry type lets an editor compose
 * fields through the standard blocks editor; the `submission` entry type
 * stores what gets posted. Frontend rendering is the site's own — the plugin
 * exposes data and accepts submissions, following the `@astromech/redirects`
 * precedent.
 */

import { definePlugin, withDefaults } from 'astromech';
import { FORMS_PACKAGE } from './types.js';
import type { FormsOptions } from './types.js';
import { submissionEntryType } from './entries/submission.js';
import { submissionsTable } from './schema/submissions.js';

export type { FormFieldKind, FormsOptions, SpamOptions, SubmissionMeta } from './types.js';
export { FORM_FIELD_KINDS } from './types.js';

const DEFAULT_OPTIONS: Required<Pick<FormsOptions, 'storeMeta'>> = {
    storeMeta: true,
};

export const forms = definePlugin((options?: FormsOptions) => {
    // Not yet consumed here — the `submit` service method (a later slice)
    // reads it to decide whether to persist `meta` on each submission.
    const { storeMeta: _storeMeta } = withDefaults(DEFAULT_OPTIONS, options);

    return {
        package: FORMS_PACKAGE,
        version: '0.1.0',
        label: 'Forms',
        icon: 'ClipboardList',
        root: import.meta.url,
        // TODO: `migrations: migrationProvider` once `astromech plugin:generate`
        // has produced `migrations/` for this table (needs `npm install` first).
        schema: [submissionsTable],
        entries: [submissionEntryType],
        hookEvents: ['forms:beforeSubmit', 'forms:afterSubmit'],
    };
});

export default forms;
