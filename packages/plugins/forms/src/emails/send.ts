/**
 * The two optional per-form emails: a notification to the site and a
 * confirmation to the submitter. Runs after the row is committed, so every send
 * is caught and logged rather than thrown back to the caller.
 */

import type { Entry, FieldDefinition, PluginContext } from 'astromech';
import { renderRichText } from 'astromech';
import {
    applyMergeTags,
    applyMergeTagsInRichText,
    mergeTagValues,
} from './merge-tags.js';
import { toValueRows } from './values.js';
import { ConfirmationEmail } from './templates/confirmation-email.js';
import { NotificationEmail } from './templates/notification-email.js';
import { firstEmailFieldName } from '../fields/compile.js';

/** `renderRichText` takes tiptap's `JSONContent`; forms doesn't depend on tiptap. */
type RichTextJson = Parameters<typeof renderRichText>[0];

/** An entry's stored field values. */
function fieldsOf(entry: Entry): Record<string, unknown> {
    return (entry.fields ?? {}) as Record<string, unknown>;
}

/**
 * Stored ProseMirror JSON to sanitized HTML, or `undefined` for an empty body.
 * The only producer of `bodyHtml`, which the templates inject with
 * `dangerouslySetInnerHTML` — nothing but `renderRichText` output may reach it.
 */
function bodyHtmlOf(value: unknown, tags: Record<string, string>): string | undefined {
    if (value === null || value === undefined) return undefined;
    const substituted = applyMergeTagsInRichText(value, tags);
    const html = renderRichText(substituted as RichTextJson);
    return html === '' ? undefined : html;
}

/** Email addresses out of the `notifyTo` repeater's stored rows. */
function recipients(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const addresses: string[] = [];
    for (const row of value) {
        if (typeof row !== 'object' || row === null) continue;
        const address = (row as { address?: unknown }).address;
        if (typeof address === 'string' && address.trim() !== '') {
            addresses.push(address.trim());
        }
    }
    return addresses;
}

/** An author's subject line with tags applied, or the fallback when unset. */
function subjectOf(
    stored: unknown,
    tags: Record<string, string>,
    fallback: string
): string {
    if (typeof stored !== 'string' || stored.trim() === '') return fallback;
    return applyMergeTags(stored, tags);
}

/** The submitter's address, from the form's `confirmToField` or its first email field. */
function confirmationRecipient(
    form: Entry,
    values: Record<string, unknown>
): string | undefined {
    const fields = fieldsOf(form);
    const named = fields['confirmToField'];
    const fieldName =
        typeof named === 'string' && named.trim() !== ''
            ? named.trim()
            : firstEmailFieldName(fields['fields']);
    if (fieldName === undefined) return undefined;
    const address = values[fieldName];
    if (typeof address !== 'string' || address.trim() === '') return undefined;
    return address.trim();
}

/** Send whichever of the two emails the form has enabled. */
export async function sendFormEmails(
    form: Entry,
    definitions: FieldDefinition[],
    values: Record<string, unknown>,
    ctx: PluginContext
): Promise<void> {
    const fields = fieldsOf(form);
    const notifyEnabled = fields['notifyEnabled'] === true;
    const confirmEnabled = fields['confirmEnabled'] === true;
    if (!notifyEnabled && !confirmEnabled) return;

    const rows = toValueRows(definitions, values);
    const submittedAt = new Date().toISOString();
    const tags = mergeTagValues(values, { formTitle: form.title, submittedAt });

    if (notifyEnabled) {
        const subject = subjectOf(
            fields['notifySubject'],
            tags,
            `New submission — ${form.title}`
        );
        const bodyHtml = bodyHtmlOf(fields['notifyBody'], tags);
        for (const to of recipients(fields['notifyTo'])) {
            try {
                await ctx.sendEmail(
                    to,
                    subject,
                    NotificationEmail({
                        formTitle: form.title,
                        ...(bodyHtml !== undefined ? { bodyHtml } : {}),
                        rows,
                        submittedAt,
                    })
                );
            } catch (error) {
                ctx.logger.error(`failed to send form notification to ${to}`, error);
            }
        }
    }

    if (confirmEnabled) {
        // A form with no email field has no address to send to.
        const to = confirmationRecipient(form, values);
        if (to === undefined) return;
        const subject = subjectOf(
            fields['confirmSubject'],
            tags,
            `Thanks for your submission — ${form.title}`
        );
        const bodyHtml = bodyHtmlOf(fields['confirmBody'], tags);
        try {
            await ctx.sendEmail(
                to,
                subject,
                ConfirmationEmail({
                    formTitle: form.title,
                    ...(bodyHtml !== undefined ? { bodyHtml } : {}),
                    rows,
                })
            );
        } catch (error) {
            ctx.logger.error(`failed to send form confirmation to ${to}`, error);
        }
    }
}
