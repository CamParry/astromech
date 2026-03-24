/**
 * AuthCard — shared layout wrapper for all auth pages.
 * Renders the full-page centred shell and the card with brand, title, and body.
 */

import React from 'react';

type AuthCardProps = {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
};

export function AuthCard({ title, subtitle, children }: AuthCardProps): React.ReactElement {
    return (
        <div className="am-auth">
            <div className="am-auth__card">
                <div className="am-auth__brand">
                    <span className="am-auth__logo">Astromech</span>
                </div>
                <div className="am-auth__header">
                    <h1 className="am-auth__title">{title}</h1>
                    {subtitle !== undefined && (
                        <p className="am-auth__subtitle">{subtitle}</p>
                    )}
                </div>
                <div className="am-auth__body">
                    {children}
                </div>
            </div>
        </div>
    );
}
