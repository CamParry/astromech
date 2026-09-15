import { createFileRoute, redirect } from '@tanstack/react-router';
import { AppShell } from '../../components/layout/app-shell';
import { AiContextProvider } from '../../context/ai-context';
import { sessionQueryOptions } from '../../context/auth';
import { UiProvider } from '../../context/ui';
import { hasPermission } from '../../hooks/use-permissions';

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
        <UiProvider>
            <AiContextProvider>
                <AppShell />
            </AiContextProvider>
        </UiProvider>
    );
}
