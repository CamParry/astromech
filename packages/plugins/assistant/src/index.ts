/**
 * @astromech/assistant — an AI assistant for the Astromech admin.
 * Identity, options, the permission it grants, the streaming chat route and
 * the admin topbar button and panel that talk to it.
 */

import type { AssistantOptions, ResolvedAssistantOptions } from './types';
import { definePlugin, withDefaults } from 'astromech';
import { migrationProvider } from '../migrations/index';
import { assistantPermissions } from './permissions/assistant';
import { chatRoutes } from './routes/chat';
import { buildSessionsService } from './service/sessions';
import { approvalsTable } from './tables/approvals';
import { sessionsTable } from './tables/sessions';
import { ASSISTANT_PACKAGE } from './types';

export type { AssistantOptions };

const DEFAULT_OPTIONS: ResolvedAssistantOptions = {
    effort: 'medium',
    readOnly: false,
};

/** Applies defaults. Called once when the site registers the plugin. */
export function resolveOptions(options?: AssistantOptions): ResolvedAssistantOptions {
    return withDefaults(DEFAULT_OPTIONS, options);
}

export const assistant = definePlugin((options?: AssistantOptions) => {
    const resolved = resolveOptions(options);

    return {
        package: ASSISTANT_PACKAGE,
        version: '0.1.0',
        label: 'Assistant',
        icon: 'Sparkles',
        tables: [approvalsTable, sessionsTable],
        migrations: migrationProvider,
        permissions: assistantPermissions,
        service: buildSessionsService(resolved),
        // Streaming only — the chat response is server-sent events.
        rawRoutes: chatRoutes(resolved),
        admin: {
            slots: [
                {
                    slot: 'toolbar',
                    component: './admin/slots/assistant-button.tsx',
                    permission: 'use',
                },
                {
                    slot: 'right-drawer',
                    component: './admin/slots/chat-drawer.tsx',
                    permission: 'use',
                },
            ],
        },
    };
});

export default assistant;
