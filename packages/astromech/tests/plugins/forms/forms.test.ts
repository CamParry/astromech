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
 * emitted from the table alongside it.
 */

import type { DB } from '@/database/types';
import type {
    AstromechConfig,
    EmailMessage,
    EntriesService,
    PluginDefinition,
    ResolvedConfig,
} from '@/types/index';
import type { FormsOptions, PublicForm, SubmitResult } from '@astromech/forms';
import type { Kysely } from 'kysely';
import { forms, turnstile } from '@astromech/forms';
import {
    createTestDb,
    makeTestConfig,
    registerTestPlugins,
    setupTestConfig,
} from '@tests/harness';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { setEmailDriver } from '@/email/registry';
import { entriesService as localEntries } from '@/entries/service';
import { defineHook } from '@/index';
import { pluginServices } from '@/plugins/runtime/plugin-services';
import { resetRateLimit } from '../../../../plugins/forms/src/service/rate-limit';

const FORM = 'forms/form';

const SPAM_SECRET_KEY = 'secret-key-never-leaves-the-server';

const SPAM: NonNullable<FormsOptions['spam']> = turnstile({
    siteKey: 'site-key-public',
    secretKey: SPAM_SECRET_KEY,
});

/** The one entries service, typed to the wide API for these round-trips. */
const entriesService = (): EntriesService => localEntries as unknown as EntriesService;

type FormsService = Record<string, (input?: unknown) => Promise<unknown>>;

function callForms(method: string, input?: unknown): Promise<unknown> {
    const service = pluginServices['forms'] as unknown as FormsService | undefined;
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
    setEmailDriver({
        name: 'test-recorder',
        send: async (message: EmailMessage): Promise<void> => {
            if (send) send();
            sent.push(message);
        },
    });
}

async function setup(options?: FormsOptions): Promise<ResolvedConfig> {
    // `plugin_forms_submissions` comes from the plugin's own generated
    // migration chain, which the harness applies — forms is registered in
    // `FIRST_PARTY_PLUGIN_MIGRATIONS`. Emitting the table from its `Table`
    // here instead would test a table the migrations might not actually
    // produce.
    // The submit rate limit counts in a process-wide map. These calls carry no
    // connecting address, so they go unmetered — the reset only clears a
    // counter another test file may have left behind.
    resetRateLimit();
    db = await createTestDb();
    recordEmails();
    return setupTestConfig(configWithForms(options));
}

async function createContactForm(
    fields: Record<string, unknown> = {}
): Promise<{ id: string }> {
    return entriesService().create({
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
            notifications: [
                {
                    _type: 'email',
                    to: 'ops@example.com',
                    subject: 'New enquiry from {{name}}',
                },
                {
                    _type: 'email',
                    to: '{{email}}',
                    subject: 'Thanks for getting in touch',
                },
            ],
        });

        // The read `get` performs is `full`-shaped, so all of the above IS on
        // the entry it holds. Prove that first — otherwise the assertions below
        // would pass for the wrong reason.
        const stored = await entriesService().get({
            type: FORM,
            id: created.id,
            full: true,
        });
        // `notifications` is a blocks field, so the field pipeline mints an
        // `_id` on each stored instance — assert the authored data, not the
        // normalized item shape.
        expect(stored?.fields['notifications']).toEqual([
            expect.objectContaining({
                _type: 'email',
                _id: expect.any(String),
                to: 'ops@example.com',
                subject: 'New enquiry from {{name}}',
            }),
            expect.objectContaining({
                _type: 'email',
                _id: expect.any(String),
                to: '{{email}}',
                subject: 'Thanks for getting in touch',
            }),
        ]);

        const form = await getForm('contact');
        expect(Object.keys(form ?? {}).sort()).toEqual([
            'fields',
            'id',
            'slug',
            'spam',
            'title',
        ]);
        expect(form).not.toHaveProperty('notifications');

        const serialized = JSON.stringify(form);
        expect(serialized).not.toContain('ops@example.com');
        expect(serialized).not.toContain('New enquiry from');
        expect(serialized).not.toContain('Thanks for getting in touch');
        expect(serialized).not.toContain(SPAM_SECRET_KEY);
        expect(serialized).not.toContain('notifications');
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
        await entriesService().create({
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
        notifications: [
            {
                _type: 'email',
                to: 'ops@example.com',
                subject: 'New enquiry from {{name}}',
            },
        ],
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

    // A merge tag in `to` is the whole confirmation mechanism — there is no
    // separate confirmation notification, only this address.
    it('resolves a merge tag in `to` to the submitter’s address', async () => {
        await setup();
        await createContactForm({
            notifications: [
                { _type: 'email', to: '{{email}}', subject: 'Thanks, {{name}}' },
            ],
        });

        await submit({
            slug: 'contact',
            data: { name: 'Ada', email: 'ada@example.com' },
        });

        expect(sent).toHaveLength(1);
        expect(sent[0]?.to).toBe('ada@example.com');
        expect(sent[0]?.subject).toBe('Thanks, Ada');
    });

    it('sends one email per comma-separated recipient', async () => {
        await setup();
        await createContactForm({
            notifications: [{ _type: 'email', to: 'ops@example.com, sales@example.com' }],
        });

        await submit({
            slug: 'contact',
            data: { name: 'Ada', email: 'ada@example.com' },
        });

        expect(sent.map((message) => message.to)).toEqual([
            'ops@example.com',
            'sales@example.com',
        ]);
    });

    it('drops a recipient whose merge tag did not resolve', async () => {
        await setup();
        await createContactForm({
            notifications: [{ _type: 'email', to: '{{noSuchField}}' }],
        });

        const result = await submit({
            slug: 'contact',
            data: { name: 'Ada', email: 'ada@example.com' },
        });

        expect(result.ok).toBe(true);
        expect(sent).toHaveLength(0);
    });

    it('skips a notification the editor disabled', async () => {
        await setup();
        await createContactForm({
            notifications: [
                { _type: 'email', to: 'ops@example.com', _disabled: true },
                { _type: 'email', to: 'sales@example.com' },
            ],
        });

        await submit({
            slug: 'contact',
            data: { name: 'Ada', email: 'ada@example.com' },
        });

        expect(sent.map((message) => message.to)).toEqual(['sales@example.com']);
    });

    it('falls back to the default subject when the editor left it empty', async () => {
        await setup();
        await createContactForm({
            notifications: [{ _type: 'email', to: 'ops@example.com' }],
        });

        await submit({
            slug: 'contact',
            data: { name: 'Ada', email: 'ada@example.com' },
        });

        expect(sent[0]?.subject).toBe('New submission — Contact');
    });
});
