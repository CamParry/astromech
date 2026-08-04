/**
 * @astromech/authoring — an AI authoring assistant for the Astromech admin.
 * Identity, options, the permission it grants, the streaming chat route and
 * the admin topbar button and panel that talk to it.
 */

import { definePlugin, withDefaults } from 'astromech';
import { authoringPermissions } from './permissions/authoring.js';
import { chatRoutes } from './routes/chat.js';
import { buildSessionsService } from './service/sessions.js';
import { migrationProvider } from '../migrations/index.js';
import { approvalsTable } from './tables/approvals.js';
import { sessionsTable } from './tables/sessions.js';
import { AUTHORING_PACKAGE } from './types.js';
import type {
    AuthoringModel,
    AuthoringOptions,
    ResolvedAuthoringOptions,
} from './types.js';

export type { AuthoringModel, AuthoringOptions };

const DEFAULT_OPTIONS: ResolvedAuthoringOptions = {
    model: 'claude-opus-5',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    effort: 'medium',
    readOnly: false,
};

/** Applies defaults. Called once when the site registers the plugin. */
export function resolveOptions(options?: AuthoringOptions): ResolvedAuthoringOptions {
    return withDefaults(DEFAULT_OPTIONS, options);
}

export const authoring = definePlugin((options?: AuthoringOptions) => {
    const resolved = resolveOptions(options);

    return {
        package: AUTHORING_PACKAGE,
        version: '0.1.0',
        label: 'Authoring',
        icon: 'Sparkles',
        tables: [approvalsTable, sessionsTable],
        migrations: migrationProvider,
        permissions: authoringPermissions,
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

export default authoring;
