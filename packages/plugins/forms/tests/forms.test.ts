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
 *   is `runHook`'s throw-propagates behaviour exercised end to end
 *   (`DECISIONS.md`).
 *
 * `plugin_forms_submissions` is created by the plugin's own generated migration
 * chain, which the harness applies (forms is in `FIRST_PARTY_PLUGIN_MIGRATIONS`)
 * — so these tests run against the table a real install would get, not one
 * emitted from the table alongside it. The submission methods behind the admin
 * resource (`listSubmissions`, `getSubmission`, `deleteSubmission`) are tested
 * here too, with their permissions.
 */

import type {
    DeleteSubmissionResult,
    FormsOptions,
    PublicForm,
    SubmitResult,
} from '../src/index';
import type { NewSubmissionRow, SubmissionRow } from '../src/tables/submissions';
import type { DB } from '@/database/types';
import type {
    AstromechConfig,
    EmailMessage,
    EntriesService,
    PluginDefinition,
    QueryResult,
    ResolvedConfig,
    Role,
} from '@/types/index';
import type { Kysely } from 'kysely';
import { roleWith } from '@tests/fixtures';
import {
    contextAs,
    createTestDb,
    makeTestConfig,
    registerTestPlugins,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createServices, currentServices } from '@/app-context/services';
import { setEmailDriver } from '@/email/registry';
import { PermissionDeniedError } from '@/errors/permission';
import { defineHook } from '@/plugins/define-hook';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';
import { resolveAdminResources } from '@/plugins/runtime/plugin-resources';
import { forms, turnstile } from '../src/index';
import { createSubmissionsRepository } from '../src/repository';
import { resetRateLimit } from '../src/service/rate-limit';

const localEntries = currentServices.entries;
const pluginServices = currentServices.plugins;

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
        data: {
            title: 'Contact',
            slug: 'contact',
            status: 'published',
            fields: { enabled: true, fields: CONTACT_BLOCKS, ...fields },
        },
    });
}

const listSubmissions = (input: Record<string, unknown> = {}) =>
    callForms('listSubmissions', input) as Promise<QueryResult<SubmissionRow>>;

const getSubmission = (id: string) =>
    callForms('getSubmission', { id }) as Promise<SubmissionRow | null>;

const deleteSubmission = (id: string) =>
    callForms('deleteSubmission', { id }) as Promise<DeleteSubmissionResult>;

/** Every stored submission, through the list method the admin calls. */
async function submissionRows(): Promise<SubmissionRow[]> {
    return (await listSubmissions({ limit: 100 })).data;
}

/** The forms service on a handle scoped to `role`, checked as a transport checks it. */
function formsAs(role: Role | null) {
    const service = createServices(contextAs(role), { overrideAccess: false }).plugins
        .forms;
    if (service === undefined) throw new Error('forms is missing from the handle');
    return service;
}

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
            data: {
                title: 'Draft',
                slug: 'draft',
                fields: { enabled: true, fields: CONTACT_BLOCKS },
            },
        });
        expect(await getForm('draft')).toBeNull();
    });
});

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

        if (!result.ok) throw new Error('expected the submission to be accepted');
        expect(await submissionRows()).toHaveLength(1);
        const stored = await getSubmission(result.id);
        expect(stored?.formSlug).toBe('contact');
        expect(stored?.data).toMatchObject({
            name: 'Ada',
            email: 'ada@example.com',
            message: 'Hello there',
        });
        // The denormalised, scannable column the submissions list renders.
        expect(stored?.summary).toBe(
            'Name: Ada · Email: ada@example.com · Message: Hello there'
        );
        expect(stored?.submittedAt).toBeInstanceOf(Date);
    });

    it('stores the caller’s meta', async () => {
        const result = await submit({
            slug: 'contact',
            data: { name: 'Ada', email: 'ada@example.com' },
            meta: { ip: '203.0.113.9' },
        });

        if (!result.ok) throw new Error('expected the submission to be accepted');
        expect((await getSubmission(result.id))?.meta).toEqual({ ip: '203.0.113.9' });
    });

    it('leaves meta out when the site turns storeMeta off', async () => {
        await setup({ storeMeta: false });
        await createContactForm();

        const result = await submit({
            slug: 'contact',
            data: { name: 'Ada', email: 'ada@example.com' },
            meta: { ip: '203.0.113.9' },
        });

        if (!result.ok) throw new Error('expected the submission to be accepted');
        expect((await getSubmission(result.id))?.meta).toBeNull();
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

/** Store a submission directly, with the timestamp and values a test needs. */
async function storeSubmission(
    row: Partial<NewSubmissionRow> & { submittedAt: Date }
): Promise<SubmissionRow> {
    return createSubmissionsRepository(db).create({
        formId: 'form-1',
        formSlug: 'contact',
        data: {},
        ...row,
    });
}

describe('forms.listSubmissions', () => {
    beforeEach(async () => {
        await setup();
    });

    it('answers newest first, one page at a time', async () => {
        // Stored out of order, so insertion order cannot pass for date order.
        const middle = await storeSubmission({ submittedAt: new Date('2026-01-02') });
        const newest = await storeSubmission({ submittedAt: new Date('2026-01-03') });
        const oldest = await storeSubmission({ submittedAt: new Date('2026-01-01') });

        const first = await listSubmissions({ page: 1, limit: 2 });
        expect(first.data.map((row) => row.id)).toEqual([newest.id, middle.id]);
        expect(first.pagination).toEqual({ page: 1, limit: 2, total: 3, pages: 2 });

        const second = await listSubmissions({ page: 2, limit: 2 });
        expect(second.data.map((row) => row.id)).toEqual([oldest.id]);
    });

    it('sorts by form when asked', async () => {
        const contact = await storeSubmission({
            formSlug: 'contact',
            submittedAt: new Date('2026-01-02'),
        });
        const booking = await storeSubmission({
            formSlug: 'booking',
            submittedAt: new Date('2026-01-01'),
        });

        const { data } = await listSubmissions({ sort: { formSlug: 'asc' } });
        expect(data.map((row) => row.id)).toEqual([booking.id, contact.id]);
    });

    it('refuses a sort on a column it cannot order by', async () => {
        await expect(listSubmissions({ sort: { summary: 'asc' } })).rejects.toMatchObject(
            {
                name: 'ValidationError',
            }
        );
    });

    it('searches the summary and the form slug', async () => {
        const ada = await storeSubmission({
            summary: 'Name: Ada',
            submittedAt: new Date('2026-01-01'),
        });
        const booking = await storeSubmission({
            formSlug: 'booking',
            summary: 'Name: Grace',
            submittedAt: new Date('2026-01-02'),
        });

        const bySummary = await listSubmissions({ search: 'Ada' });
        expect(bySummary.data.map((row) => row.id)).toEqual([ada.id]);
        expect(bySummary.pagination?.total).toBe(1);

        const bySlug = await listSubmissions({ search: 'book' });
        expect(bySlug.data.map((row) => row.id)).toEqual([booking.id]);
    });

    it('filters to one form', async () => {
        await storeSubmission({
            formSlug: 'contact',
            submittedAt: new Date('2026-01-01'),
        });
        const booking = await storeSubmission({
            formSlug: 'booking',
            submittedAt: new Date('2026-01-02'),
        });

        const { data, pagination } = await listSubmissions({ formSlug: 'booking' });
        expect(data.map((row) => row.id)).toEqual([booking.id]);
        expect(pagination?.total).toBe(1);
    });
});

describe('forms.getSubmission and forms.deleteSubmission', () => {
    beforeEach(async () => {
        await setup();
    });

    it('returns null for an unknown id', async () => {
        expect(await getSubmission('no-such-id')).toBeNull();
    });

    it('deletes a submission, and reports one it cannot find', async () => {
        const stored = await storeSubmission({ submittedAt: new Date('2026-01-01') });

        expect(await deleteSubmission(stored.id)).toEqual({ ok: true, id: stored.id });
        expect(await getSubmission(stored.id)).toBeNull();
        expect(await deleteSubmission(stored.id)).toEqual({
            ok: false,
            reason: 'not-found',
        });
    });
});

describe('forms submission permissions', () => {
    beforeEach(async () => {
        await setup();
    });

    it('refuses to list submissions without the read permission', async () => {
        await expect(formsAs(roleWith([])).listSubmissions({})).rejects.toThrow(
            PermissionDeniedError
        );
        await expect(
            formsAs(roleWith([])).getSubmission({ id: 'x' })
        ).rejects.toMatchObject({ permission: 'plugin:forms:read' });
    });

    it('lists submissions with the read permission', async () => {
        const stored = await storeSubmission({ submittedAt: new Date('2026-01-01') });
        const read = forms.permissions('read');

        const result = await formsAs(roleWith(read)).listSubmissions({});
        expect(result.data.map((row) => row.id)).toEqual([stored.id]);
    });

    it('refuses to delete with the read permission alone', async () => {
        const stored = await storeSubmission({ submittedAt: new Date('2026-01-01') });

        await expect(
            formsAs(roleWith(forms.permissions('read'))).deleteSubmission({
                id: stored.id,
            })
        ).rejects.toMatchObject({ permission: 'plugin:forms:delete' });
        expect(await getSubmission(stored.id)).not.toBeNull();
    });

    it('leaves submit public', async () => {
        await createContactForm();

        const result = await formsAs(null).submit({
            slug: 'contact',
            data: { name: 'Ada', email: 'ada@example.com' },
        });
        expect(result.ok).toBe(true);
    });
});

describe('the Submissions admin resource', () => {
    it('binds a read-only list and edit screen to the submission methods', () => {
        const definition = forms();
        const [resource] = resolveAdminResources(
            resolvePluginIdentity(definition),
            definition
        );

        expect(resource?.name).toBe('submissions');
        expect(resource?.methods).toEqual({
            list: { name: 'listSubmissions', permission: 'plugin:forms:read' },
            get: { name: 'getSubmission', permission: 'plugin:forms:read' },
            delete: { name: 'deleteSubmission', permission: 'plugin:forms:delete' },
        });
        expect(resource?.columns).toEqual([
            { field: 'formSlug', sortable: true },
            { field: 'summary', sortable: false },
            { field: 'submittedAt', sortable: true },
        ]);
    });

    it('leaves the form as the plugin’s only entry type', () => {
        expect(forms().entries?.map((entryType) => entryType.type)).toEqual(['form']);
    });
});
