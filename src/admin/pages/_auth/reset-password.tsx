/**
 * Reset password page for the Astromech admin SPA.
 */

import React, { useState } from 'react';
import { createFileRoute, useSearch, useNavigate, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AuthCard } from '@/admin/components/auth/AuthCard.js';
import { Input } from '@/admin/components/ui/input.js';
import { Button } from '@/admin/components/ui/button.js';

declare const __ASTROMECH_API_ROUTE__: string;

function ResetPasswordPage() {
    const { t } = useTranslation();
    const search = useSearch({ from: '/_auth/reset-password' });
    const token = (search as Record<string, string | undefined>).token ?? '';
    const navigate = useNavigate();

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        if (newPassword !== confirmPassword) {
            setError(t('auth.passwordsDoNotMatch'));
            return;
        }

        setIsSubmitting(true);

        try {
            const res = await fetch(`${__ASTROMECH_API_ROUTE__}/auth/reset-password`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword }),
            });

            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { message?: string };
                throw new Error(data.message ?? 'Reset failed');
            }

            await navigate({ to: '/login' });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Reset failed');
        } finally {
            setIsSubmitting(false);
        }
    }

    if (!token) {
        return (
            <AuthCard title="Invalid link">
                <p className="am-auth__message">{t('auth.invalidLinkMessage')}</p>
                <p className="am-auth__footer-link">
                    <Link to="/login">{t('auth.backToLogin')}</Link>
                </p>
            </AuthCard>
        );
    }

    return (
        <AuthCard title="Reset password">
            <form onSubmit={handleSubmit}>
                <div className="am-auth__fields">
                    <Input
                        label="New password"
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
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
                        {isSubmitting ? t('auth.resettingPassword') : t('auth.resetPassword')}
                    </Button>
                </div>
            </form>
        </AuthCard>
    );
}

export const Route = createFileRoute('/_auth/reset-password')({
	component: ResetPasswordPage,
});
