/**
 * The plugin's public service: `get` returns a render-ready form definition,
 * `submit` validates and stores a set of submitted values. Both are `public`,
 * so neither may assume a session, and both report failure as a result shape.
 */

import type {
    Entry,
    FieldDefinition,
    FieldErrors,
    PluginContext,
    ScopedReads,
} from 'astromech';
import { defineServiceMethod, z } from 'astromech';
import { processFields } from 'astromech/fields';
import { compileFormFields } from '../fields/compile.js';
import { toValueRows } from '../emails/values.js';
import {
    AFTER_SUBMIT,
    BEFORE_SUBMIT,
    type FormsAfterSubmitPayload,
    type FormsBeforeSubmitPayload,
} from '../hooks/events.js';
import { sendFormEmails } from '../emails/send.js';
import { FORM_TYPE, SUBMISSION_TYPE } from '../types.js';
import type { FormsOptions, SpamOptions, SubmissionMeta } from '../types.js';

// ============================================================================
// Result shapes
// ============================================================================

/** The public projection of a form, built by explicit allow-list. */
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
    // Explicit `| undefined` to match what Zod `.optional()` widens to, under
    // `exactOptionalPropertyTypes`.
    token?: string | undefined;
    meta?: SubmissionMeta | undefined;
};

export type SubmitResult = { ok: true; id: string } | { ok: false; errors: FieldErrors };

/**
 * Call schema for `submit`, published to the method manifest. Describes the
 * argument object only — `data` is validated at call time against the form's
 * own compiled fields, which no static schema can know.
 */
const submitInputSchema = z.object({
    slug: z.string(),
    data: z.record(z.string(), z.unknown()),
    token: z.string().optional(),
    meta: z
        .object({
            ip: z.string().optional(),
            userAgent: z.string().optional(),
            referer: z.string().optional(),
        })
        .optional(),
});

/** Reserved `FieldErrors` key for errors that belong to the form, not a field. */
export const FORM_ERROR_KEY = '_form';

const NOT_ACCEPTING = 'This form is not accepting submissions';

/** A form-level failure, keyed under the reserved non-field key. */
function formError(message: string): SubmitResult {
    return { ok: false, errors: { [FORM_ERROR_KEY]: [message] } };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * `processFields` only reaches this port for DB-backed rules, which the form
 * compiler never emits. It throws rather than answering `true` so a compiler
 * change that does emit one fails loudly.
 */
const noReads: ScopedReads = {
    isUnique: () => {
        throw new Error(
            '[@astromech/forms] a compiled form field emitted a read-backed validation rule, ' +
                'but forms has no reads port to serve it'
        );
    },
};

/** An entry's stored field values. */
function fieldsOf(entry: Entry): Record<string, unknown> {
    return (entry.fields ?? {}) as Record<string, unknown>;
}

/**
 * Load a live, submittable form by slug, or `null`. `ctx.entries` reads are
 * `full`-shaped and so bypass the publish gate, making the published and
 * enabled checks this function's own job.
 */
async function loadForm(ctx: PluginContext, slug: unknown): Promise<Entry | null> {
    if (typeof slug !== 'string' || slug === '') return null;

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
const SUMMARY_ROWS = 3;

/**
 * A human-scannable rendering of a submission for the list column, since no
 * cell kind can summarise a JSON blob.
 */
function buildSummary(
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

/** True for a plain object, excluding arrays and `null`. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ============================================================================
// Service
// ============================================================================

/** Build the service surface from the resolved plugin options. */
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
            input: z.object({ slug: z.string() }),
            mutates: false,
            handler: async (input, ctx): Promise<PublicForm | null> => {
                const form = await loadForm(ctx, input?.slug);
                if (form === null) return null;

                // Allow-list, never a spread: the `full` read holds the
                // notify/confirm copy and recipients, and this is the one
                // method an anonymous caller reaches. Site key only.
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
            input: submitInputSchema,
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

                // Core routes `:before` through `runBeforeHooks`, so a throwing
                // subscriber (spam, or a third party's) aborts with nothing
                // persisted.
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
                // Post-commit, and swallow-and-logged by core.
                await ctx.emit(AFTER_SUBMIT, after);

                // The row is committed, so a send failure is logged, not returned.
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
