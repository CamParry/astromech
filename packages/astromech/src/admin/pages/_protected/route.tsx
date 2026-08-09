import { createFileRoute, redirect } from '@tanstack/react-router';
import { sessionQueryOptions } from '../../context/auth';
import { hasPermission } from '../../hooks/use-permissions';
import { UIProvider } from '../../context/ui';
import { AIContextProvider } from '../../context/ai-context';
import { AppShell } from '../../components/layout/app-shell';

export const Route = createFileRoute('/_protected')({
    beforeLoad: async ({ context }) => {
        const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
        if (session === null || !hasPermission(session.permissions, 'admin:access')) {
            throw redirect({ to: '/login' });
        }
    },
    pendingComponent: () => <div className="am-loading" />,
    pendingMs: 0,
    component: ProtectedLayout,
});

function ProtectedLayout() {
    return (
        <UIProvider>
            <AIContextProvider>
                <AppShell />
            </AIContextProvider>
        </UIProvider>
    );
}
