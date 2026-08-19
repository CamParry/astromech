/**
 * The `email` notification: an address, a subject and a body, each written by
 * the editor. A literal address makes it a site notification; a `{{field}}` tag
 * resolving to the submitter's address makes it a confirmation.
 */

import type { NotificationProvider } from '../types';
import { renderRichText } from 'astromech';
import * as fields from 'astromech/fields';
import { applyMergeTags, applyMergeTagsInRichText } from '../merge-tags';
import { SubmissionEmail } from '../templates/submission-email';

export const EMAIL_NOTIFICATION = 'email';

const MERGE_TAG_MESSAGE =
    'Supports {{fieldName}}, {{formTitle}} and {{submittedAt}} merge tags.';

const DEFAULT_SUBJECT = 'New submission — {{formTitle}}';

/** `renderRichText` takes tiptap's `JSONContent`; forms doesn't depend on tiptap. */
type RichTextJson = Parameters<typeof renderRichText>[0];

/** Send one email per resolved recipient, each failure logged, never thrown. */
export const emailNotification: NotificationProvider = {
    type: EMAIL_NOTIFICATION,
    block: fields.block(EMAIL_NOTIFICATION, {
        label: 'Email',
        fields: [
            fields.text('to', {
                label: 'To',
                required: true,
                description: `A literal address, or a merge tag such as {{email}} to reply to the submitter. Separate several with commas.`,
            }),
            fields.text('subject', {
                label: 'Subject',
                defaultValue: DEFAULT_SUBJECT,
                description: MERGE_TAG_MESSAGE,
            }),
            fields.richtext('body', {
                label: 'Body',
                description: `${MERGE_TAG_MESSAGE} Leave empty to send just the table of submitted values.`,
            }),
        ],
    }),
    deliver: async (config, context) => {
        const { ctx, rows, submittedAt, tags } = context;

        const subject = resolveSubject(config['subject'], tags);
        const bodyHtml = renderBody(config['body'], tags);

        for (const to of resolveRecipients(config['to'], tags)) {
            try {
                await ctx.email.send(
                    to,
                    subject,
                    SubmissionEmail({
                        preview: subject,
                        ...(bodyHtml !== undefined ? { bodyHtml } : {}),
                        rows,
                        submittedAt,
                    })
                );
            } catch (error) {
                ctx.logger.error(`failed to send form notification to ${to}`, error);
            }
        }
    },
};

/** The author's subject with tags applied, falling back to the block's default. */
function resolveSubject(stored: unknown, tags: Record<string, string>): string {
    const template =
        typeof stored === 'string' && stored.trim() !== '' ? stored : DEFAULT_SUBJECT;
    return applyMergeTags(template, tags);
}

/**
 * Stored ProseMirror JSON to sanitized HTML, or `undefined` for an empty body.
 * The only producer of `bodyHtml`, which the template injects with
 * `dangerouslySetInnerHTML` — nothing but `renderRichText` output may reach it.
 */
function renderBody(value: unknown, tags: Record<string, string>): string | undefined {
    if (value === null || value === undefined) return undefined;
    const substituted = applyMergeTagsInRichText(value, tags);
    const html = renderRichText(substituted as RichTextJson);
    return html === '' ? undefined : html;
}

/**
 * The `to` field as addresses: tags applied, split on commas, deduped. Anything
 * without an `@` is dropped, which is what an unresolved merge tag leaves behind.
 */
function resolveRecipients(stored: unknown, tags: Record<string, string>): string[] {
    if (typeof stored !== 'string') return [];
    const addresses = applyMergeTags(stored, tags)
        .split(',')
        .map((address) => address.trim())
        .filter((address) => address.includes('@'));
    return [...new Set(addresses)];
}
