/**
 * Ends the session, then sends the visitor to the login page. Log out links
 * here rather than signing out itself, so the unsaved-changes guard asks first.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';
import { logout } from '../context/auth';

export const Route = createFileRoute('/logout')({
    beforeLoad: async ({ context, preload }) => {
        // A preload (a link hovered) must not sign the visitor out.
        if (preload) return;
        await logout(context.queryClient);
        throw redirect({ to: '/login' });
    },
});
