/**
 * @astromech/forms — forms with runtime-composed fields, a public submission
 * API, and spam protection. An editor composes a `form` entry's fields in the
 * blocks editor; a `submission` entry stores what gets posted.
 */

import type { FormsOptions } from './types';
import type { PluginDB, ServiceInterface } from 'astromech';
import { definePlugin, withDefaults } from 'astromech';
import { migrationProvider } from '../migrations/index';
import { formEntryType } from './entries/form';
import { submissionEntryType } from './entries/submission';
import { buildFormsService } from './service/forms';
import { spamHook } from './spam/hook';
import { submissionsTable } from './tables/submissions';
import { FORMS_PACKAGE } from './types';

/** Listed once: the definition and the `AstromechPluginTables` augmentation both read it. */
const tables = [submissionsTable] as const;

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginServices {
        forms: ServiceInterface<ReturnType<typeof buildFormsService>>;
    }

    // Puts this plugin's tables on a site's `db` handle.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
    interface AstromechPluginTables extends PluginDB<typeof tables> {}
}

export type { FormFieldKind, FormsOptions, SubmissionMeta } from './types';
export { FORM_FIELD_KINDS } from './types';
export type { FormsAfterSubmitPayload, FormsBeforeSubmitPayload } from './hooks/events';
export { FORM_ERROR_KEY } from './service/forms';
export type { PublicForm, SubmitInput, SubmitResult } from './service/forms';
export type { SpamContext, SpamProvider, SpamVerdict } from './spam/types';
export { turnstile } from './spam/providers/turnstile';
export type { TurnstileOptions } from './spam/providers/turnstile';
export { recaptcha } from './spam/providers/recaptcha';
export type { RecaptchaOptions } from './spam/providers/recaptcha';
export type {
    NotificationContext,
    NotificationProvider,
    StoredNotification,
} from './notifications/types';

const DEFAULT_OPTIONS: Required<Pick<FormsOptions, 'storeMeta' | 'rateLimit'>> = {
    storeMeta: true,
    rateLimit: { limit: 20, windowMs: 60_000 },
};

export const forms = definePlugin((options?: FormsOptions) => {
    const { storeMeta, rateLimit } = withDefaults(DEFAULT_OPTIONS, options);
    const spam = options?.spam;

    return {
        package: FORMS_PACKAGE,
        version: '0.1.0',
        label: 'Forms',
        icon: 'ClipboardList',
        tables,
        migrations: migrationProvider,
        entries: [formEntryType, submissionEntryType],
        service: buildFormsService({ storeMeta, rateLimit, spam }),
        hookEvents: ['forms:beforeSubmit', 'forms:afterSubmit'],
        // Registered through the same public extension point a third party
        // would use, and only when the site configured a provider.
        ...(spam !== undefined && { hooks: [spamHook(spam)] }),
    };
});

export default forms;
