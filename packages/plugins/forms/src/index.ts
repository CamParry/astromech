/**
 * @astromech/forms — forms with runtime-composed fields, a public submission
 * API, and spam protection. An editor composes a `form` entry's fields in the
 * blocks editor; a `submission` entry stores what gets posted.
 */

import { definePlugin, withDefaults } from 'astromech';
import type { ServiceInterface } from 'astromech';
import { FORMS_PACKAGE } from './types.js';
import type { FormsOptions } from './types.js';
import { migrationProvider } from '../migrations/index.js';
import { formEntryType } from './entries/form.js';
import { submissionEntryType } from './entries/submission.js';
import { submissionsTable } from './tables/submissions.js';
import { buildFormsService } from './service/forms.js';
import { spamHook } from './spam/hook.js';

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginServices {
        forms: ServiceInterface<ReturnType<typeof buildFormsService>>;
    }
}

export type {
    FormFieldKind,
    FormsOptions,
    SpamOptions,
    SubmissionMeta,
} from './types.js';
export { FORM_FIELD_KINDS } from './types.js';
export type {
    FormsAfterSubmitPayload,
    FormsBeforeSubmitPayload,
} from './hooks/events.js';
export { FORM_ERROR_KEY } from './service/forms.js';
export type { PublicForm, SubmitInput, SubmitResult } from './service/forms.js';

const DEFAULT_OPTIONS: Required<Pick<FormsOptions, 'storeMeta'>> = {
    storeMeta: true,
};

export const forms = definePlugin((options?: FormsOptions) => {
    const { storeMeta } = withDefaults(DEFAULT_OPTIONS, options);
    const spam = options?.spam;

    return {
        package: FORMS_PACKAGE,
        version: '0.1.0',
        label: 'Forms',
        icon: 'ClipboardList',
        root: import.meta.url,
        tables: [submissionsTable],
        migrations: migrationProvider,
        entries: [formEntryType, submissionEntryType],
        service: buildFormsService({ storeMeta, spam }),
        hookEvents: ['forms:beforeSubmit', 'forms:afterSubmit'],
        // Registered through the same public extension point a third party
        // would use, and only when the site configured a provider.
        ...(spam !== undefined && { hooks: [spamHook(spam)] }),
    };
});

export default forms;
