/**
 * First-run setup for the Astromech admin SPA. Shown while no users exist, it
 * creates the first admin, and asks for the user fields when a required one has no default.
 */

import type { Field, FieldErrors } from 'astromech';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AstromechApiError } from 'astromech/fetch';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { AuthCard } from '../../components/auth/auth-card';
import {
    fieldChainForError,
    fieldErrorNames,
} from '../../components/fields/field-error-summary';
import { FieldColumn, FieldsFormProvider } from '../../components/forms/fields-form';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { setupCheckQueryOptions, useAuth } from '../../context/auth';
import { readValidationErrors, useFieldsForm } from '../../hooks/use-fields-form';
import { labelNamespace } from '../../i18n/entry-namespace';
import { resolveLabel } from '../../i18n/labels';
import { requiredFieldErrors } from '../../utilities/requires-field-values';

declare const __ASTROMECH_BASE_PATH__: string;

/** The account keys the form holds beside the user fields. */
type SetupValues = {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
};

/** Ties the submit button, which sits below the user fields, to the account form. */
const SETUP_FORM_ID = 'am-setup-form';

/** The keys `POST /setup` takes beside `data`, which a 422 may name. */
const ACCOUNT_KEYS = new Set(['name', 'email', 'password']);

/** Field types whose picker reads the API, which needs a signed-in user. */
const PICKER_TYPES = new Set(['media', 'relationship']);

/** What the page shows once its checks have run. */
type SetupState =
    | { status: 'checking' }
    /** The form, with these user fields below the account keys. */
    | { status: 'form'; userFields: Field[] }
    /** A required picker field with no default, which no one can fill in before sign-in. */
    | { status: 'blocked'; missing: FieldErrors };

function SetupPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [state, setState] = useState<SetupState>({ status: 'checking' });

    useEffect(() => {
        void (async () => {
            try {
                // Through the query cache, so the login route's redirect reads this answer.
                const data = await queryClient.fetchQuery(setupCheckQueryOptions);
                if (!data.needsSetup) {
                    await navigate({ to: '/' });
                    return;
                }
            } catch {
                // If the check fails, allow the form to be shown
            }
            const fields = adminConfig.users.fields;
            // A check that cannot run shows the fields rather than hiding a required one.
            const missing = await requiredFieldErrors(fields, 'user').catch(() => null);
            if (missing === null) {
                setState({ status: 'form', userFields: fields });
                return;
            }
            const pickers = Object.entries(missing).filter(([path]) =>
                PICKER_TYPES.has(fieldChainForError(fields, path)?.at(-1)?.type ?? '')
            );
            if (pickers.length > 0) {
                setState({ status: 'blocked', missing: Object.fromEntries(pickers) });
                return;
            }
            const needed = Object.keys(missing).length > 0;
            setState({ status: 'form', userFields: needed ? fields : [] });
        })();
    }, [navigate, queryClient]);

    if (state.status === 'checking') {
        return (
            <AuthCard title="Set up Astromech">
                <p className="am-auth-message">Loading…</p>
            </AuthCard>
        );
    }

    if (state.status === 'blocked') return <SetupBlocked missing={state.missing} />;

    return (
        <SetupForm
            userFields={state.userFields}
            // A check only the server runs (a field's `validate`, a function
            // default, `users.validate`) refused a user field the form left out.
            onUserFieldErrors={() =>
                setState({ status: 'form', userFields: adminConfig.users.fields })
            }
        />
    );
}

/** Names the picker fields setup cannot fill in, and the two ways past them. */
function SetupBlocked({ missing }: { missing: FieldErrors }): React.ReactElement {
    const { t } = useTranslation();
    const names = fieldErrorNames(missing, adminConfig.users.fields, (label) =>
        resolveLabel(label, '', t, labelNamespace(undefined))
    );
    return (
        <AuthCard title="Set up Astromech">
            <p className="am-auth-message">
                {t('auth.setupNeedsDefault', {
                    count: names.length,
                    fields: names.join(', '),
                })}
            </p>
        </AuthCard>
    );
}

/** The account form, with `userFields` below the account keys when there are any. */
function SetupForm({
    userFields,
    onUserFieldErrors,
}: {
    userFields: Field[];
    /** Called when a 422 names a user field, so the page can show them. */
    onUserFieldErrors: () => void;
}): React.ReactElement {
    const { login } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const formRef = useRef<HTMLFormElement>(null);

    // A refusal that names no field (sign-up closed, a network failure) or a
    // sign-in that fails after the account was created; a 422 lands on its fields.
    const [error, setError] = useState<string | null>(null);

    const setupForm = useFieldsForm<SetupValues, SetupValues>({
        fieldDefinitions: userFields,
        operation: 'create',
        defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
        saveHotkey: false,
        onSubmit: async (values) => {
            try {
                await createFirstAdmin({
                    name: values.name,
                    email: values.email,
                    password: values.password,
                    data: { fields: values.fields },
                });
            } catch (err) {
                const named = Object.keys(
                    (err instanceof Error ? readValidationErrors(err) : null)?.fields ??
                        {}
                );
                if (named.some((key) => !ACCOUNT_KEYS.has(key))) onUserFieldErrors();
                throw err;
            }
            return values;
        },
        onSuccess: (values) => void signIn(values),
        onError: (err) =>
            setError(err.message !== '' ? err.message : t('auth.setupFailed')),
    });
    const { form, mutation, fieldErrors } = setupForm;

    async function signIn(values: SetupValues): Promise<void> {
        // Otherwise the cached answer sends a signed-out admin back here from login.
        queryClient.setQueryData(setupCheckQueryOptions.queryKey, { needsSetup: false });
        try {
            await login(values.email, values.password);
            await navigate({ to: '/' });
        } catch (err) {
            setError(err instanceof Error ? err.message : t('auth.setupFailed'));
        }
    }

    function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
        e.preventDefault();
        setError(null);
        setupForm.handleSubmit();
    }

    /**
     * Enter in a user field submits, as it does in an account input. The user
     * fields sit outside the form element, so their own buttons cannot submit it.
     */
    function submitOnEnter(e: React.KeyboardEvent<HTMLDivElement>): void {
        if (e.key !== 'Enter' || e.defaultPrevented) return;
        if (!(e.target instanceof HTMLInputElement)) return;
        e.preventDefault();
        formRef.current?.requestSubmit();
    }

    return (
        <AuthCard
            title="Set up Astromech"
            subtitle="Create the first admin account to get started."
        >
            <form id={SETUP_FORM_ID} ref={formRef} onSubmit={handleSubmit}>
                <div className="am-auth-fields">
                    <form.Field name="name">
                        {(field) => (
                            <Input
                                label="Name"
                                type="text"
                                autoComplete="name"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                error={fieldErrors['name']?.[0]}
                                required
                            />
                        )}
                    </form.Field>
                    <form.Field name="email">
                        {(field) => (
                            <Input
                                label="Email"
                                type="email"
                                autoComplete="email"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                error={fieldErrors['email']?.[0]}
                                required
                            />
                        )}
                    </form.Field>
                    <form.Field name="password">
                        {(field) => (
                            <Input
                                label="Password"
                                type="password"
                                autoComplete="new-password"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                error={fieldErrors['password']?.[0]}
                                minLength={8}
                                required
                            />
                        )}
                    </form.Field>
                    <form.Field
                        name="confirmPassword"
                        validators={{
                            onSubmit: ({ value, fieldApi }) =>
                                value === fieldApi.form.getFieldValue('password')
                                    ? undefined
                                    : t('auth.passwordsDoNotMatch'),
                        }}
                    >
                        {(field) => (
                            <Input
                                label="Confirm password"
                                type="password"
                                autoComplete="new-password"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                error={field.state.meta.errors[0]}
                                required
                            />
                        )}
                    </form.Field>
                </div>
            </form>
            {userFields.length > 0 && (
                <div className="am-auth-fields" onKeyDown={submitOnEnter}>
                    <FieldsFormProvider form={setupForm}>
                        <FieldColumn form={setupForm} />
                    </FieldsFormProvider>
                </div>
            )}
            {error !== null && <p className="am-auth-error">{error}</p>}
            <div className="am-auth-actions">
                <Button
                    type="submit"
                    form={SETUP_FORM_ID}
                    variant="primary"
                    className="am-btn-full"
                    disabled={mutation.isPending}
                >
                    {mutation.isPending
                        ? t('auth.setupCreatingAccount')
                        : t('auth.setupCreateAccount')}
                </Button>
            </div>
        </AuthCard>
    );
}

/**
 * `POST /setup`. A refusal throws an `AstromechApiError`, so the form maps a
 * 422's `details.fields` onto the fields it names.
 */
async function createFirstAdmin(body: {
    name: string;
    email: string;
    password: string;
    data: { fields: Record<string, unknown> };
}): Promise<void> {
    const res = await fetch(`${__ASTROMECH_BASE_PATH__}/api/setup`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (res.ok) return;

    const payload = (await res.json().catch(() => ({}))) as {
        error?: ConstructorParameters<typeof AstromechApiError>[0];
    };
    if (payload.error?.code !== undefined) throw new AstromechApiError(payload.error);
    throw new Error('Setup failed');
}

export const Route = createFileRoute('/_auth/setup')({
    component: SetupPage,
});
