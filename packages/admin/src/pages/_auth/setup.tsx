/**
 * First-run setup for the Astromech admin SPA. Shown while no users exist, it
 * creates the first admin, and asks for the user fields when a required one has no default.
 */

import type { Field } from 'astromech';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AstromechApiError } from 'astromech/fetch';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { AuthCard } from '../../components/auth/auth-card';
import { FieldColumn, FieldsFormProvider } from '../../components/forms/fields-form';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { setupCheckQueryOptions, useAuth } from '../../context/auth';
import { useFieldsForm } from '../../hooks/use-fields-form';
import { requiresFieldValues } from '../../utilities/requires-field-values';

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

function SetupPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // The user fields the form shows; null while the checks run.
    const [userFields, setUserFields] = useState<Field[] | null>(null);

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
            const needed = await requiresFieldValues(fields, 'user').catch(() => true);
            setUserFields(needed ? fields : []);
        })();
    }, [navigate, queryClient]);

    if (userFields === null) {
        return (
            <AuthCard title="Set up Astromech">
                <p className="am-auth-message">Loading…</p>
            </AuthCard>
        );
    }

    return <SetupForm userFields={userFields} />;
}

/** The account form, with `userFields` below the account keys when there are any. */
function SetupForm({ userFields }: { userFields: Field[] }): React.ReactElement {
    const { login } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    // A sign-in that fails after the account was created; the form reports the rest.
    const [error, setError] = useState<string | null>(null);

    const setupForm = useFieldsForm<SetupValues, SetupValues>({
        fieldDefinitions: userFields,
        operation: 'create',
        defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
        onSubmit: async (values) => {
            await createFirstAdmin({
                name: values.name,
                email: values.email,
                password: values.password,
                data: { fields: values.fields },
            });
            return values;
        },
        onSuccess: (values) => void signIn(values),
    });
    const { form, mutation } = setupForm;

    async function signIn(values: SetupValues): Promise<void> {
        // Otherwise the cached answer sends a signed-out admin back here from login.
        queryClient.setQueryData(setupCheckQueryOptions.queryKey, { needsSetup: false });
        try {
            await login(values.email, values.password);
            await navigate({ to: '/' });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Setup failed');
        }
    }

    function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
        e.preventDefault();
        setError(null);
        setupForm.handleSubmit();
    }

    return (
        <AuthCard
            title="Set up Astromech"
            subtitle="Create the first admin account to get started."
        >
            <form id={SETUP_FORM_ID} onSubmit={handleSubmit}>
                <div className="am-auth-fields">
                    <form.Field name="name">
                        {(field) => (
                            <Input
                                label="Name"
                                type="text"
                                autoComplete="name"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
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
                            <>
                                <Input
                                    label="Confirm password"
                                    type="password"
                                    autoComplete="new-password"
                                    value={field.state.value}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    required
                                />
                                {field.state.meta.errors.length > 0 && (
                                    <p className="am-auth-error">
                                        {field.state.meta.errors[0]}
                                    </p>
                                )}
                            </>
                        )}
                    </form.Field>
                </div>
            </form>
            {/* Outside the form element: a field's own buttons must not submit it. */}
            {userFields.length > 0 && (
                <div className="am-auth-fields">
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
 * 422's `details.fields` onto the user fields.
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
