/**
 * First-run setup wizard for the Astromech admin SPA.
 *
 * Shown when no users exist. Creates the first admin account.
 */

import React, { useEffect, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/admin/context/auth.js';
import { AuthCard } from '@/admin/components/auth/AuthCard.js';
import { Input } from '@/admin/components/ui/input.js';
import { Button } from '@/admin/components/ui/button.js';

declare const __ASTROMECH_API_ROUTE__: string;

function SetupPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        fetch(`${__ASTROMECH_API_ROUTE__}/setup/check`, { credentials: 'include' })
            .then(async (res) => {
                const data = (await res.json()) as { needsSetup: boolean };
                if (!data.needsSetup) {
                    await navigate({ to: '/' });
                }
            })
            .catch(() => {
                // If the check fails, allow the form to be shown
            })
            .finally(() => {
                setIsChecking(false);
            });
    }, [navigate]);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        if (password !== confirmPassword) {
            setError(t('auth.passwordsDoNotMatch'));
            return;
        }

        setIsSubmitting(true);

        try {
            const res = await fetch(`${__ASTROMECH_API_ROUTE__}/auth/sign-up/email`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password }),
            });

            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { message?: string };
                throw new Error(data.message ?? 'Setup failed');
            }

            await login(email, password);
            await navigate({ to: '/' });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Setup failed');
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isChecking) {
        return (
            <AuthCard title="Set up Astromech">
                <p className="am-auth__message">Loading…</p>
            </AuthCard>
        );
    }

    return (
        <AuthCard title="Set up Astromech" subtitle="Create the first admin account to get started.">
            <form onSubmit={handleSubmit}>
                <div className="am-auth__fields">
                    <Input
                        label="Name"
                        type="text"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />
                    <Input
                        label="Email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <Input
                        label="Password"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <Input
                        label="Confirm password"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />
                </div>
                {error !== null && (
                    <p className="am-auth__error">{error}</p>
                )}
                <div className="am-auth__actions">
                    <Button type="submit" variant="primary" className="am-btn--full" disabled={isSubmitting}>
                        {isSubmitting ? t('auth.setupCreatingAccount') : t('auth.setupCreateAccount')}
                    </Button>
                </div>
            </form>
        </AuthCard>
    );
}

export const Route = createFileRoute('/_auth/setup')({
	component: SetupPage,
});
