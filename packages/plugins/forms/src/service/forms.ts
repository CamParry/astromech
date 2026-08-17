/**
 * The plugin's public service: `get` returns a render-ready form definition,
 * `submit` validates and stores a set of submitted values. Both are `public`,
 * so neither may assume a session, and both report failure as a result shape.
 */

import type { Field, FieldErrors, FieldLookups } from 'astromech';
import { defineServiceMethod, z } from 'astromech';
import { parseFields } from 'astromech/fields';
import { compileFormFields } from '../fields/compile';
import {
    AFTER_SUBMIT,
    BEFORE_SUBMIT,
    type FormsAfterSubmitPayload,
    type FormsBeforeSubmitPayload,
} from '../hooks/events';
import { sendNotifications } from '../notifications/dispatch';
import { consumeRateLimit } from './rate-limit';
import type { SpamProvider } from '../spam/types';
import { SUBMISSION_TYPE } from '../types';
import type { FormsOptions, SubmissionMeta } from '../types';
import { entryFields, loadForm, usesSpam } from '../utilities/form-entry';
import { buildSummary } from '../utilities/summary';

/** The public projection of a form, built by explicit allow-list. */
export type PublicForm = {
    id: string;
    slug: string;
    title: string;
    /** Exactly the fields `submit` will validate against. */
    fields: Field[];
    /** Present only when the site configured a provider AND the form uses it. Never carries the secret key. */
    spam?: { provider: string; siteKey: string };
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

/** Reserved `FieldErrors` key for errors that belong to the form, not a field. */
export const FORM_ERROR_KEY = '_form';

/** Build the service surface from the resolved plugin options. */
export function buildFormsService(
    options: Required<Pick<FormsOptions, 'storeMeta' | 'rateLimit'>> & {
        spam?: SpamProvider | undefined;
    }
) {
    const { spam, storeMeta, rateLimit } = options;

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
                // notification copy and recipients, and this is the one method
                // an anonymous caller reaches. Site key only.
                return {
                    id: form.id,
                    slug: form.slug ?? '',
                    title: form.title,
                    fields: compileFormFields(entryFields(form)['fields']),
                    ...(spam !== undefined && usesSpam(form)
                        ? { spam: { provider: spam.name, siteKey: spam.siteKey } }
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
                // A caller with no connecting address is a trusted local one
                // (CLI, MCP, in-process) and goes unmetered. `meta.ip` is not
                // read here: it is caller-supplied, so keying on it would let a
                // client mint a fresh counter per request.
                const address = ctx.clientAddress;
                if (rateLimit !== false && address !== undefined) {
                    if (!consumeRateLimit(address, rateLimit)) return formError(TOO_MANY);
                }

                const form = await loadForm(ctx, input?.slug);
                if (form === null) return formError(NOT_ACCEPTING);

                const definitions = compileFormFields(entryFields(form)['fields']);
                const { values, errors } = await parseFields(
                    isRecord(input?.data) ? input.data : {},
                    definitions,
                    {
                        operation: 'create',
                        resource: { kind: 'entry', record: null },
                        user: ctx.user,
                        lookups: noReads,
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

                // The row is committed, so a delivery failure is logged, not returned.
                try {
                    await sendNotifications(form, definitions, values, ctx);
                } catch (error) {
                    ctx.logger.error(
                        `failed to send notifications for submission ${submission.id}`,
                        error
                    );
                }

                return { ok: true, id: submission.id };
            },
        }),
    };
}

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

const NOT_ACCEPTING = 'This form is not accepting submissions';

const TOO_MANY = 'Too many submissions — please try again shortly';

/**
 * `parseFields` only reaches this port for DB-backed rules, which the form
 * compiler never emits. It throws rather than answering `true` so a compiler
 * change that does emit one fails loudly.
 */
const noReads: FieldLookups = {
    isUnique: () => {
        throw new Error(
            '[@astromech/forms] a compiled form field emitted a read-backed validation rule, ' +
                'but forms has no reads port to serve it'
        );
    },
};

/** A form-level failure, keyed under the reserved non-field key. */
function formError(message: string): SubmitResult {
    return { ok: false, errors: { [FORM_ERROR_KEY]: [message] } };
}

/** True for a plain object, excluding arrays and `null`. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
