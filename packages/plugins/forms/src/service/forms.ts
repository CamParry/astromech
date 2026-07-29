/**
 * The plugin's public service — the only surface a site's frontend touches.
 * `get` hands over a render-ready form definition; `submit` validates and
 * stores an answer set. Both are `access: 'public'`, so both are reachable by
 * an anonymous caller and neither may assume a session.
 *
 * RPC carries no status channel (see the plugin-consistency sweep), so every
 * failure here is a RESULT SHAPE rather than a throw. Form-level failures —
 * "no such form", "not accepting submissions", a rejected spam check — are
 * reported under the reserved {@link FORM_ERROR_KEY} in the same `FieldErrors`
 * map as per-field messages, so a caller has exactly one error shape to render.
 */

import type {
    Entry,
    FieldDefinition,
    FieldErrors,
    PluginContext,
    ScopedReads,
} from 'astromech';
import { defineServiceMethod } from 'astromech';
import { processFields } from 'astromech/fields';
import { compileFormFields } from '../fields/compile.js';
import { toAnswerRows } from '../emails/index.js';
import {
    AFTER_SUBMIT,
    BEFORE_SUBMIT,
    type FormsAfterSubmitPayload,
    type FormsBeforeSubmitPayload,
} from '../hooks/events.js';
import { sendFormEmails } from './notify.js';
import { FORM_TYPE, SUBMISSION_TYPE } from '../types.js';
import type { FormsOptions, SpamOptions, SubmissionMeta } from '../types.js';

// ============================================================================
// Result shapes
// ============================================================================

/**
 * The public projection of a form. Built by explicit allow-list — see the
 * comment on the `get` handler for why nothing here is ever spread from the
 * stored entry.
 */
export type PublicForm = {
    id: string;
    slug: string;
    title: string;
    /** Exactly the fields `submit` will validate against. */
    fields: FieldDefinition[];
    /** Present only when the site configured a provider AND the form uses it. Never carries the secret key. */
    spam?: { provider: SpamOptions['provider']; siteKey: string };
};

export type SubmitInput = {
    slug: string;
    data: Record<string, unknown>;
    token?: string;
    meta?: SubmissionMeta;
};

export type SubmitResult = { ok: true; id: string } | { ok: false; errors: FieldErrors };

/** Reserved `FieldErrors` key for errors that belong to the form, not a field. */
export const FORM_ERROR_KEY = '_form';

const NOT_ACCEPTING = 'This form is not accepting submissions';

function formError(message: string): SubmitResult {
    return { ok: false, errors: { [FORM_ERROR_KEY]: [message] } };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * `processFields` needs a `reads` port only for rules that hit the database:
 * `unique`, and reference checks. The form-field compiler emits neither — it
 * only ever produces `minLength`/`maxLength`/`min`/`max`/`enum` (see
 * `fields/compile.ts`) — so this port is unreachable, and passing a stub costs
 * forms nothing. It THROWS rather than answering `true`, so a future compiler
 * change that does emit a read-backed rule fails loudly instead of silently
 * passing every uniqueness check.
 */
const noReads: ScopedReads = {
    isUnique: () => {
        throw new Error(
            '[@astromech/forms] a compiled form field emitted a read-backed validation rule, ' +
                'but forms has no reads port to serve it'
        );
    },
};

function fieldsOf(entry: Entry): Record<string, unknown> {
    return (entry.fields ?? {}) as Record<string, unknown>;
}

/**
 * Load a live, submittable form by slug, or `null`.
 *
 * `ctx.entries` defaults to the `full` shape at plugin altitude, and `full`
 * also bypasses the publish gate — so the published check is this function's
 * own job, not something the read did for it.
 */
async function loadForm(ctx: PluginContext, slug: unknown): Promise<Entry | null> {
    if (typeof slug !== 'string' || slug === '') return null;

    // The global entries service, addressed by this plugin's qualified type id
    // built from context — never a hardcoded 'forms/form'.
    const { data } = await ctx.entries.query({
        type: `${ctx.plugin.namespace}/${FORM_TYPE}`,
        where: { slug },
        limit: 1,
    });

    const form = (data as Entry[])[0];
    if (!form) return null;
    if (form.status !== 'published') return null;
    // Absent means "on": the field's declared default is true.
    if (fieldsOf(form)['enabled'] === false) return null;
    return form;
}

/** True when this form opts into the site's configured spam provider. */
function usesSpam(form: Entry): boolean {
    return fieldsOf(form)['spamProtection'] !== false;
}

const SUMMARY_MAX_LENGTH = 120;
const SUMMARY_SEPARATOR = ' · ';
const SUMMARY_ANSWERS = 3;

/**
 * The denormalised, human-scannable rendering of a submission. Exists because
 * the submissions list needs a column an editor can read and no cell kind can
 * summarise a JSON blob (a text cell renders one as "[object Object]").
 */
function buildSummary(
    definitions: FieldDefinition[],
    values: Record<string, unknown>
): string {
    const text = toAnswerRows(definitions, values)
        .slice(0, SUMMARY_ANSWERS)
        .map((row) => `${row.label}: ${row.value}`)
        .join(SUMMARY_SEPARATOR);
    if (text.length <= SUMMARY_MAX_LENGTH) return text;
    return `${text.slice(0, SUMMARY_MAX_LENGTH - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ============================================================================
// Service
// ============================================================================

export function buildFormsService(
    options: Required<Pick<FormsOptions, 'storeMeta'>> & {
        spam?: SpamOptions | undefined;
    }
) {
    const { spam, storeMeta } = options;

    return {
        get: defineServiceMethod<{ slug: string }, PublicForm | null>({
            access: 'public',
            summary: 'Fetch a published form’s public definition by slug.',
            mutates: false,
            handler: async (input, ctx): Promise<PublicForm | null> => {
                const form = await loadForm(ctx, input?.slug);
                if (form === null) return null;

                // EXPLICIT ALLOW-LIST — never spread the entry. This is the one
                // method an anonymous caller reaches, and the read above is
                // `full`-shaped, so it arrives holding the notification
                // recipients and email copy. Nothing named notify*/confirm*
                // may appear below, and `spam` carries the SITE key only —
                // `spam.secretKey` never leaves the server.
                return {
                    id: form.id,
                    slug: form.slug ?? '',
                    title: form.title,
                    fields: compileFormFields(fieldsOf(form)['fields']),
                    ...(spam !== undefined && usesSpam(form)
                        ? { spam: { provider: spam.provider, siteKey: spam.siteKey } }
                        : {}),
                };
            },
        }),

        submit: defineServiceMethod<SubmitInput, SubmitResult>({
            access: 'public',
            summary: 'Validate and store a submission against a published form.',
            mutates: true,
            handler: async (input, ctx): Promise<SubmitResult> => {
                const form = await loadForm(ctx, input?.slug);
                if (form === null) return formError(NOT_ACCEPTING);

                const definitions = compileFormFields(fieldsOf(form)['fields']);
                const { values, errors } = await processFields(
                    isRecord(input?.data) ? input.data : {},
                    definitions,
                    {
                        operation: 'create',
                        host: { kind: 'entry', record: null },
                        user: ctx.user,
                        reads: noReads,
                    }
                );
                // Validation runs BEFORE the spam gate so a legitimate user
                // whose token has expired still sees their field errors.
                if (Object.keys(errors).length > 0) return { ok: false, errors };

                const payload: FormsBeforeSubmitPayload = {
                    form: {
                        id: form.id,
                        slug: form.slug ?? '',
                        title: form.title,
                        spamProtection: usesSpam(form),
                    },
                    data: values,
                    ...(typeof input?.token === 'string' ? { token: input.token } : {}),
                    ...(isRecord(input?.meta)
                        ? { meta: input.meta as SubmissionMeta }
                        : {}),
                };

                // GATES. Core routes `:before` events through `runBeforeHooks`,
                // so a subscriber that throws — the built-in spam handler, or
                // any third party's — aborts here with nothing persisted.
                try {
                    await ctx.emit(BEFORE_SUBMIT, payload);
                } catch (error) {
                    return formError(
                        error instanceof Error ? error.message : 'Submission rejected'
                    );
                }

                const submission = await ctx.entries.create({
                    type: `${ctx.plugin.namespace}/${SUBMISSION_TYPE}`,
                    fields: {
                        formId: form.id,
                        formSlug: payload.form.slug,
                        // The COERCED values, not the raw input.
                        data: values,
                        summary: buildSummary(definitions, values),
                        ...(storeMeta && payload.meta !== undefined
                            ? { meta: payload.meta }
                            : {}),
                        submittedAt: new Date(),
                    },
                });

                const after: FormsAfterSubmitPayload = {
                    ...payload,
                    submissionId: submission.id,
                };
                // Post-commit: core swallow-and-logs this one, so a throwing
                // subscriber can't undo a row that is already written.
                await ctx.emit(AFTER_SUBMIT, after);

                // The submission is committed; email is a courtesy on top of
                // it. A send failure is logged and the caller still gets ok.
                try {
                    await sendFormEmails(form, definitions, values, ctx);
                } catch (error) {
                    ctx.logger.error(
                        `failed to send emails for submission ${submission.id}`,
                        error
                    );
                }

                return { ok: true, id: submission.id };
            },
        }),
    };
}
