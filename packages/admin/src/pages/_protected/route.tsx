import { createFileRoute, redirect } from '@tanstack/react-router';
import { AppShell } from '../../components/layout/app-shell';
import { AiContextProvider } from '../../context/ai-context';
import { logout, sessionQueryOptions } from '../../context/auth';
import { UiProvider } from '../../context/ui';
import { hasPermission } from '../../hooks/use-permissions';

export const Route = createFileRoute('/_protected')({
    beforeLoad: async ({ context }) => {
        const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
        if (session === null) throw redirect({ to: '/login' });
        // A session without admin access opens no admin page, so it ends here and
        // the login page says why rather than sending the user straight back.
        if (!hasPermission(session.permissions, 'admin:access')) {
            await logout(context.queryClient);
            throw redirect({ to: '/login', search: { error: 'access_denied' } });
        }
    },
    pendingComponent: () => <div className="am-loading" />,
    pendingMs: 0,
    component: ProtectedLayout,
});

function ProtectedLayout() {
    return (
        <UiProvider>
            <AiContextProvider>
                <AppShell />
            </AiContextProvider>
        </UiProvider>
    );
}
