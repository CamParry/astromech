/**
 * @astromech/forms — forms with runtime-composed fields, a public submission
 * API, and spam protection. An editor composes a `form` entry's fields in the
 * blocks editor; what gets posted is stored in the plugin's own table.
 */

import type { FormsOptions } from './types';
import type { PluginDB, ServiceInterface } from 'astromech';
import { definePlugin, withDefaults } from 'astromech';
import { migrationProvider } from '../migrations/index';
import { version } from '../package.json';
import { formEntryType } from './entries/form';
import { formsPermissions } from './permissions/forms';
import { submissionsResource } from './resources/submissions';
import { createFormsService } from './service/forms';
import { spamHook } from './spam/hook';
import { rateLimitsTable } from './tables/rate-limits';
import { submissionsTable } from './tables/submissions';
import { FORMS_PACKAGE } from './types';

/** Listed once: the definition and the `AstromechPluginTables` augmentation both read it. */
const tables = [submissionsTable, rateLimitsTable] as const;

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginServices {
        forms: ServiceInterface<ReturnType<typeof createFormsService>>;
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
export type { DeleteSubmissionResult, Submission } from './service/submissions';
export type { SpamContext, SpamProvider, SpamVerdict } from './spam/types';
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
        version,
        label: 'Forms',
        icon: 'ClipboardList',
        tables,
        migrations: migrationProvider,
        permissions: formsPermissions,
        entries: [formEntryType],
        admin: { resources: [submissionsResource] },
        service: createFormsService({ storeMeta, rateLimit, spam }),
        hookEvents: ['forms:beforeSubmit', 'forms:afterSubmit'],
        // Registered through the same public extension point a third party
        // would use. It does nothing without a `spam` option or a captcha.
        hooks: [spamHook(spam)],
    };
});

export default forms;
