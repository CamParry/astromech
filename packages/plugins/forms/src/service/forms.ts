/**
 * The forms service. The public `get` and `submit` serve a site's visitors
 * and report failure as a result shape; the submission methods serve the admin.
 */
import type { FormsAfterSubmitPayload, FormsBeforeSubmitPayload } from '../hooks/events';
import type { SpamProvider } from '../spam/types';
import type { FormsOptions, SubmissionMeta } from '../types';
import type { DataField } from 'astromech';
import { defineServiceMethod, rateLimitKey, z } from 'astromech';
import { safeParseFields } from 'astromech/fields';
import { compileFormFields } from '../fields/compile';
import { AFTER_SUBMIT, BEFORE_SUBMIT } from '../hooks/events';
import { sendNotifications } from '../notifications/dispatch';
import { createSubmissionsRepository } from '../repository';
import { entryFields, loadForm, usesSpam } from '../utilities/form-entry';
import { buildSummary } from '../utilities/summary';
import { consumeRateLimit } from './rate-limit';
import {
    deleteSubmission,
    getSubmission,
    listSubmissions,
    submissionMetaSchema,
} from './submissions';

/** The public projection of a form, built by explicit allow-list. */
const publicFormSchema = z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    /**
     * Exactly the fields `submit` will validate against. Each is checked to be
     * an object and not walked: `compileFormFields` built it moments before.
     */
    fields: z.array(
        z
            .custom<DataField>(isRecord, {
                message: 'Expected a field definition',
            })
            .openapi({ type: 'object', additionalProperties: true })
    ),
    /**
     * Present only when the site configured a provider and the form uses it.
     * Never carries the secret key.
     */
    spam: z.object({ provider: z.string(), siteKey: z.string() }).optional(),
});

export type PublicForm = z.output<typeof publicFormSchema>;

export type SubmitInput = {
    slug: string;
    data: Record<string, unknown>;
    // Explicit `| undefined` to match what Zod `.optional()` widens to, under
    // `exactOptionalPropertyTypes`.
    token?: string | undefined;
    meta?: SubmissionMeta | undefined;
};

const submitResultSchema = z.union([
    z.object({ ok: z.literal(true), id: z.string() }),
    z.object({
        ok: z.literal(false),
        /** Messages by field name, and under `_form` for the form as a whole. */
        errors: z.record(z.string(), z.array(z.string())),
    }),
]);

export type SubmitResult = z.output<typeof submitResultSchema>;

/** Reserved `FieldErrors` key for errors that belong to the form, not a field. */
export const FORM_ERROR_KEY = '_form';

/** Build the service surface from the resolved plugin options. */
export function createFormsService(
    options: Required<Pick<FormsOptions, 'storeMeta' | 'rateLimit'>> & {
        spam?: SpamProvider | undefined;
    }
) {
    const { spam, storeMeta, rateLimit } = options;

    return {
        get: defineServiceMethod({
            summary: 'Fetch a published form’s public definition by slug.',
            input: z.strictObject({ slug: z.string() }),
            output: publicFormSchema.nullable(),
            access: 'public',
            mutates: false,
            async handler(params, ctx): Promise<PublicForm | null> {
                const { slug } = params;

                const form = await loadForm(ctx, slug);
                if (form === null) return null;

                const stored = entryFields(form);
                const fields = compileFormFields(stored['fields']);

                // Allow-list, never a spread: the `full` read holds the
                // notification copy and recipients, and this is the one method
                // an anonymous caller reaches. Site key only.
                return {
                    id: form.id,
                    slug: form.slug ?? '',
                    title: form.title,
                    fields,
                    ...(spam !== undefined && usesSpam(form)
                        ? { spam: { provider: spam.name, siteKey: spam.siteKey } }
                        : {}),
                };
            },
        }),

        /**
         * `data` is checked against the form's own compiled fields at call time.
         * Every refusal, the rate limit and spam check included, is an
         * `ok: false` result rather than a throw.
         */
        submit: defineServiceMethod({
            summary: 'Validate and store a submission against a published form.',
            input: z.strictObject({
                slug: z.string(),
                data: z.record(z.string(), z.unknown()),
                token: z.string().optional(),
                // A strict copy, so the output schema still strips a stored `meta`.
                meta: z.strictObject(submissionMetaSchema.shape).optional(),
            }),
            output: submitResultSchema,
            access: 'public',
            mutates: true,
            async handler(params, ctx): Promise<SubmitResult> {
                const { slug, data, token, meta } = params;
                const { clientAddress, user } = ctx;
                const submissions = createSubmissionsRepository(ctx.db);

                const form = await loadForm(ctx, slug);
                if (form === null) return formError(NOT_ACCEPTING);
                // Counted per form found, so an unknown slug writes no count. A
                // caller with no connecting address (CLI, MCP, in-process) goes
                // unmetered, and `meta.ip` is never the key: a client sets it.
                if (rateLimit !== false && clientAddress !== undefined) {
                    const key = { address: rateLimitKey(clientAddress), formId: form.id };
                    const allowed = await consumeRateLimit(ctx.db, key, rateLimit);
                    if (!allowed) return formError(TOO_MANY);
                }
                const stored = entryFields(form);
                const definitions = compileFormFields(stored['fields']);
                const { values, errors } = await safeParseFields(data, definitions, {
                    operation: 'create',
                    resource: { kind: 'plugin', record: null },
                    user,
                });
                // Validation runs before the spam check, so a user whose token
                // has expired still sees their field errors.
                if (Object.keys(errors).length > 0) return { ok: false, errors };

                const payload: FormsBeforeSubmitPayload = {
                    form: {
                        id: form.id,
                        slug: form.slug ?? '',
                        title: form.title,
                        spamProtection: usesSpam(form),
                    },
                    data: values,
                    ...(token !== undefined ? { token } : {}),
                    ...(clientAddress !== undefined ? { clientAddress } : {}),
                    ...(meta !== undefined ? { meta } : {}),
                };

                // A throwing subscriber, the spam check among them, refuses
                // the submission before anything is stored.
                try {
                    await ctx.runHook(BEFORE_SUBMIT, payload);
                } catch (error) {
                    return formError(
                        error instanceof Error ? error.message : 'Submission rejected'
                    );
                }

                const summary = buildSummary(definitions, values);

                const submission = await submissions.create({
                    formId: form.id,
                    formSlug: payload.form.slug,
                    data: values,
                    summary,
                    ...(storeMeta && payload.meta !== undefined
                        ? { meta: payload.meta }
                        : {}),
                    submittedAt: new Date(),
                });

                // The address gates the spam check only; it goes no further.
                const { clientAddress: _clientAddress, ...submitted } = payload;
                const after: FormsAfterSubmitPayload = {
                    ...submitted,
                    submissionId: submission.id,
                };
                // Not caught: a throwing subscriber fails the call, though the
                // row is already stored.
                await ctx.runHook(AFTER_SUBMIT, after);
                // The row is stored, so a delivery failure is logged, not returned.
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

        listSubmissions,
        getSubmission,
        deleteSubmission,
    };
}

const NOT_ACCEPTING = 'This form is not accepting submissions';

const TOO_MANY = 'Too many submissions — please try again shortly';

/** A form-level failure, keyed under the reserved non-field key. */
function formError(message: string): SubmitResult {
    return { ok: false, errors: { [FORM_ERROR_KEY]: [message] } };
}

/** True for a plain object, excluding arrays and `null`. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
