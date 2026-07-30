/**
 * End-to-end tests for `@astromech/forms`' public service, against a real
 * database and the real plugin registration — never a mocked DB.
 *
 * Two things here are load-bearing beyond the happy paths:
 *
 * - `get` must not leak the notification settings or the spam secret. The read
 *   it performs is `full`-shaped (plugin altitude), so the entry it holds DOES
 *   carry them; the allow-list projection is the only thing keeping them off
 *   the wire. One test proves both halves of that.
 * - a throwing `forms:beforeSubmit` subscriber must abort the submission. That
 *   is the core `emitEvent` gating change exercised end to end — before it,
 *   every emitted event was swallow-and-logged and a rejected spam check would
 *   have been saved anyway.
 *
 * `plugin_forms_submissions` is created by the plugin's own generated migration
 * chain, which the harness applies (forms is in `FIRST_PARTY_PLUGIN_MIGRATIONS`)
 * — so these tests run against the table a real install would get, not one
 * emitted from the descriptor alongside it.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { defineHook } from '@/index.js';
import { setEmailConfig } from '@/email/registry.js';
import {
    createTestDb,
    makeTestConfig,
    registerTestPlugins,
    setupTestConfig,
} from '@tests/harness.js';
import '@/transport/local/index.js'; // registers the plugin client (setPluginClient)
import { localPlugins } from '@/transport/local/plugins.js';
import { entries as localEntries } from '@/entries/service.js';
import { forms } from '@astromech/forms';
import type { FormsOptions, PublicForm, SubmitResult } from '@astromech/forms';
import type { DB } from '@/database/types.js';
import type {
    AstromechConfig,
    EmailMessage,
    EntriesApi,
    PluginDefinition,
    ResolvedConfig,
} from '@/types/index.js';

const FORM = 'forms/form';

const SPAM: NonNullable<FormsOptions['spam']> = {
    provider: 'turnstile',
    siteKey: 'site-key-public',
    secretKey: 'secret-key-never-leaves-the-server',
};

/** The one entries service, typed to the wide API for these round-trips. */
const entriesApi = (): EntriesApi => localEntries as unknown as EntriesApi;

type FormsService = Record<string, (input?: unknown) => Promise<unknown>>;

function callForms(method: string, input?: unknown): Promise<unknown> {
    const service = localPlugins['forms'] as unknown as FormsService | undefined;
    const fn = service?.[method];
    if (!fn) throw new Error(`forms.${method} not registered`);
    return fn(input);
}

const getForm = (slug: string): Promise<PublicForm | null> =>
    callForms('get', { slug }) as Promise<PublicForm | null>;

const submit = (input: {
    slug: string;
    data: Record<string, unknown>;
    token?: string;
    meta?: { ip?: string };
}): Promise<SubmitResult> => callForms('submit', input) as Promise<SubmitResult>;

let db: Kysely<DB>;
let sent: EmailMessage[];

/** The blocks the fixture form composes its answer schema from. */
const CONTACT_BLOCKS = [
    { _type: 'text', _id: 'b1', name: 'name', label: 'Name', required: true },
    { _type: 'email', _id: 'b2', name: 'email', label: 'Email', required: true },
    { _type: 'textarea', _id: 'b3', name: 'message', label: 'Message' },
];

function configWithForms(options?: FormsOptions): AstromechConfig {
    return { ...makeTestConfig(), plugins: [forms(options)] };
}

/** Recording email driver — the failure case swaps in a throwing one. */
function recordEmails(send?: () => never): void {
    sent = [];
    setEmailConfig({
        from: 'site@example.com',
        driver: {
            name: 'test-recorder',
            send: async (message: EmailMessage): Promise<void> => {
                if (send) send();
                sent.push(message);
            },
        },
    });
}

async function setup(options?: FormsOptions): Promise<ResolvedConfig> {
    // `plugin_forms_submissions` comes from the plugin's own generated
    // migration chain, which the harness applies — forms is registered in
    // `FIRST_PARTY_PLUGIN_MIGRATIONS`. Emitting the table from the descriptor
    // here instead would test a table the migrations might not actually
    // produce.
    db = await createTestDb();
    recordEmails();
    return setupTestConfig(configWithForms(options));
}

async function createContactForm(
    fields: Record<string, unknown> = {}
): Promise<{ id: string }> {
    return entriesApi().create({
        type: FORM,
        title: 'Contact',
        slug: 'contact',
        status: 'published',
        fields: { enabled: true, fields: CONTACT_BLOCKS, ...fields },
    });
}

async function submissionRows(): Promise<Record<string, unknown>[]> {
    const { rows } = await sql`SELECT * FROM plugin_forms_submissions`.execute(db);
    return rows as Record<string, unknown>[];
}

// ============================================================================
// get
// ============================================================================

describe('forms.get', () => {
    beforeEach(async () => {
        await setup({ spam: SPAM });
    });

    it('returns the compiled fields and the public site key', async () => {
        await createContactForm({ spamProtection: true });

        const form = await getForm('contact');
        expect(form?.slug).toBe('contact');
        expect(form?.title).toBe('Contact');
        expect(form?.fields.map((field) => [field.name, field.type])).toEqual([
            ['name', 'text'],
            ['email', 'email'],
            ['message', 'textarea'],
        ]);
        expect(form?.spam).toEqual({ provider: 'turnstile', siteKey: SPAM.siteKey });
    });

    it('leaks neither the notification settings nor the spam secret', async () => {
        const created = await createContactForm({
            spamProtection: true,
            notifyEnabled: true,
            notifyTo: [{ address: 'ops@example.com' }],
            notifySubject: 'New enquiry from {{name}}',
            confirmEnabled: true,
            confirmSubject: 'Thanks for getting in touch',
            confirmToField: 'email',
        });

        // The read `get` performs is `full`-shaped, so all of the above IS on
        // the entry it holds. Prove that first — otherwise the assertions below
        // would pass for the wrong reason.
        const stored = await entriesApi().get({ type: FORM, id: created.id, full: true });
        // `notifyTo` is a repeater, so the field pipeline mints an `_id` on each
        // stored item — assert the authored data, not the normalized item shape.
        expect(stored?.fields['notifyTo']).toEqual([
            expect.objectContaining({ address: 'ops@example.com' }),
        ]);
        expect(stored?.fields['confirmToField']).toBe('email');

        const form = await getForm('contact');
        expect(Object.keys(form ?? {}).sort()).toEqual([
            'fields',
            'id',
            'slug',
            'spam',
            'title',
        ]);

        const serialized = JSON.stringify(form);
        expect(serialized).not.toContain('ops@example.com');
        expect(serialized).not.toContain('New enquiry from');
        expect(serialized).not.toContain('Thanks for getting in touch');
        expect(serialized).not.toContain(SPAM.secretKey);
        expect(serialized).not.toContain('notify');
        expect(serialized).not.toContain('confirm');
    });

    it('returns null for an unknown slug', async () => {
        await createContactForm();
        expect(await getForm('nope')).toBeNull();
    });

    it('returns null for a disabled form', async () => {
        await createContactForm({ enabled: false });
        expect(await getForm('contact')).toBeNull();
    });

    it('returns null for an unpublished form', async () => {
        await entriesApi().create({
            type: FORM,
            title: 'Draft',
            slug: 'draft',
            fields: { enabled: true, fields: CONTACT_BLOCKS },
        });
        expect(await getForm('draft')).toBeNull();
    });
});

// ============================================================================
// submit
// ============================================================================

describe('forms.submit', () => {
    beforeEach(async () => {
        await setup();
        await createContactForm();
    });

    it('persists a submission and returns its id', async () => {
        const result = await submit({
            slug: 'contact',
            data: { name: 'Ada', email: 'ada@example.com', message: 'Hello there' },
        });

        expect(result.ok).toBe(true);
        const rows = await submissionRows();
        expect(rows).toHaveLength(1);
        // Kysely's CamelCasePlugin maps the result keys back to camelCase.
        expect(rows[0]?.['formSlug']).toBe('contact');
        expect(JSON.parse(String(rows[0]?.['data']))).toMatchObject({
            name: 'Ada',
            email: 'ada@example.com',
            message: 'Hello there',
        });
        // The denormalised, scannable column the submissions list renders.
        expect(rows[0]?.['summary']).toBe(
            'Name: Ada · Email: ada@example.com · Message: Hello there'
        );
    });

    it('reports per-field errors and persists nothing', async () => {
        const result = await submit({
            slug: 'contact',
            data: { email: 'not-an-email' },
        });

        expect(result).toEqual({
            ok: false,
            errors: {
                name: ['This field is required'],
                email: ['Must be a valid email address'],
            },
        });
        expect(await submissionRows()).toHaveLength(0);
    });

    it('reports a form-level error for an unknown form', async () => {
        const result = await submit({ slug: 'nope', data: {} });
        expect(result).toEqual({
            ok: false,
            errors: { _form: ['This form is not accepting submissions'] },
        });
        expect(await submissionRows()).toHaveLength(0);
    });
});

// ============================================================================
// forms:beforeSubmit gating
// ============================================================================

describe('forms.submit — the beforeSubmit gate', () => {
    beforeEach(async () => {
        await setup();
        await createContactForm();
    });

    it('aborts the submission when a subscriber throws, persisting nothing', async () => {
        const probe: PluginDefinition = {
            package: '@astromech/probe',
            hooks: [
                defineHook('forms:beforeSubmit', () => {
                    throw new Error('Spam check failed: Missing verification token');
                }),
            ],
        };
        registerTestPlugins([forms(), probe], setupTestConfig(configWithForms()));

        const result = await submit({
            slug: 'contact',
            data: { name: 'Ada', email: 'ada@example.com' },
        });

        expect(result).toEqual({
            ok: false,
            errors: { _form: ['Spam check failed: Missing verification token'] },
        });
        expect(await submissionRows()).toHaveLength(0);
    });

    it('sees the coerced data and the form identity on the payload', async () => {
        const observed: unknown[] = [];
        const probe: PluginDefinition = {
            package: '@astromech/probe',
            hooks: [
                defineHook(
                    'forms:beforeSubmit',
                    (payload) => void observed.push(payload)
                ),
            ],
        };
        registerTestPlugins([forms(), probe], setupTestConfig(configWithForms()));

        await submit({
            slug: 'contact',
            data: { name: 'Ada', email: 'ada@example.com' },
            token: 'token-123',
        });

        expect(observed[0]).toMatchObject({
            form: { slug: 'contact', title: 'Contact', spamProtection: true },
            data: { name: 'Ada', email: 'ada@example.com' },
            token: 'token-123',
        });
    });
});

// ============================================================================
// emails
// ============================================================================

describe('forms.submit — emails', () => {
    const NOTIFYING = {
        notifyEnabled: true,
        notifyTo: [{ address: 'ops@example.com' }],
        notifySubject: 'New enquiry from {{name}}',
    };

    it('sends the notification with its placeholders substituted', async () => {
        await setup();
        await createContactForm(NOTIFYING);

        const result = await submit({
            slug: 'contact',
            data: { name: 'Ada', email: 'ada@example.com' },
        });

        expect(result.ok).toBe(true);
        expect(sent).toHaveLength(1);
        expect(sent[0]?.to).toBe('ops@example.com');
        expect(sent[0]?.subject).toBe('New enquiry from Ada');
    });

    it('still returns ok when the driver throws — the row is already committed', async () => {
        await setup();
        await createContactForm(NOTIFYING);
        recordEmails(() => {
            throw new Error('smtp is down');
        });

        const result = await submit({
            slug: 'contact',
            data: { name: 'Ada', email: 'ada@example.com' },
        });

        expect(result.ok).toBe(true);
        expect(await submissionRows()).toHaveLength(1);
    });
});
