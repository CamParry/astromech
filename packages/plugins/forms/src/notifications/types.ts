/**
 * The contract a notification provider satisfies. A provider owns both halves
 * of one notification kind: the block an editor fills in, and its delivery.
 */

import type { Block, Entry, Field, PluginContext } from 'astromech';
import type { ValueRow } from '../utilities/values.js';

/**
 * One stored notification block instance. `_type` selects the provider and the
 * rest is that provider's own config, so everything is `unknown`.
 */
export type StoredNotification = {
    _type?: unknown;
    _id?: unknown;
    _disabled?: unknown;
    [key: string]: unknown;
};

/** Everything a provider needs about the submission it is reporting. */
export type NotificationContext = {
    form: Entry;
    definitions: Field[];
    values: Record<string, unknown>;
    /** Submitted values paired with their field labels, in field order. */
    rows: ValueRow[];
    /** Merge-tag values available to this provider's author-written copy. */
    tags: Record<string, string>;
    submittedAt: string;
    ctx: PluginContext;
};

/** One notification kind — its editor block and how it delivers. */
export type NotificationProvider = {
    /** Matches the stored block's `_type`. */
    type: string;
    /** The `fields.block(...)` definition shown in the form's Notifications tab. */
    block: Block;
    deliver(config: StoredNotification, context: NotificationContext): Promise<void>;
};
