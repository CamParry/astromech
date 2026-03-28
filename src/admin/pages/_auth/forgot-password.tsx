/**
 * Forgot password page for the Astromech admin SPA.
 */

import { useState, type FormEvent } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AuthCard } from '@/admin/components/auth/AuthCard.js';
import { Input } from '@/admin/components/ui/input.js';
import { Button } from '@/admin/components/ui/button.js';

declare const __ASTROMECH_API_ROUTE__: string;
declare const __ASTROMECH_ADMIN_ROUTE__: string;

function ForgotPasswordPage() {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const redirectTo = window.location.origin + __ASTROMECH_ADMIN_ROUTE__ + '/reset-password';
            const res = await fetch(`${__ASTROMECH_API_ROUTE__}/auth/forget-password`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, redirectTo }),
            });

            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { message?: string };
                throw new Error(data.message ?? 'Request failed');
            }

            setSubmitted(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Request failed');
        } finally {
            setIsSubmitting(false);
        }
    }

    if (submitted) {
        return (
            <AuthCard title="Check your email">
                <p className="am-auth__message">
                    We sent a reset link to <strong>{email}</strong>. Check your inbox.
                </p>
                <p className="am-auth__footer-link">
                    <Link to="/login">{t('auth.backToLogin')}</Link>
                </p>
            </AuthCard>
        );
    }

    return (
        <AuthCard title="Forgot password" subtitle="Enter your email and we'll send you a reset link.">
            <form onSubmit={handleSubmit}>
                <div className="am-auth__fields">
                    <Input
                        label="Email address"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                {error !== null && (
                    <p className="am-auth__error">{error}</p>
                )}
                <div className="am-auth__actions">
                    <Button type="submit" variant="primary" className="am-btn--full" disabled={isSubmitting}>
                        {isSubmitting ? t('auth.sendingResetLink') : t('auth.sendResetLink')}
                    </Button>
                    <p className="am-auth__footer-link">
                        <Link to="/login">{t('auth.backToLogin')}</Link>
                    </p>
                </div>
            </form>
        </AuthCard>
    );
}

export const Route = createFileRoute('/_auth/forgot-password')({
	component: ForgotPasswordPage,
});
