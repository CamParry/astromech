import { baseLayout } from './base.js';

export function passwordResetTemplate(url: string): {
    subject: string;
    html: string;
    text: string;
} {
    const subject = 'Reset your password';

    const html = baseLayout(`
        <p>Hi,</p>
        <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
        <a class="btn" href="${url}">Reset password</a>
        <p>If you did not request a password reset, you can safely ignore this email.</p>
    `);

    const text = `Reset your password\n\nWe received a request to reset your password. Open the link below to choose a new one. This link expires in 1 hour.\n\n${url}\n\nIf you did not request a password reset, you can safely ignore this email.`;

    return { subject, html, text };
}
