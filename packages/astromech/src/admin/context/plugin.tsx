/**
 * Plugin UI context + `useAstromechPlugin()` (spec §8).
 *
 * The `/plugin/$` catch-all provides the identity of the plugin whose
 * surface is rendering; the hook hands plugin components their runtime
 * toolbox: `{ sdk, toast, modal, currentUser, navigate, t }`, with `t`
 * pre-scoped to the plugin's i18n namespace (= its derived namespace).
 */

import React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Astromech } from '@/transport/http/client/index.js';
import { useToast } from '@/admin/components/ui/index.js';
import { useConfirm } from '@/admin/components/ui/confirm.js';
import { useAuth } from '@/admin/context/auth.js';

export type PluginUiIdentity = {
    /** The plugin's derived namespace, e.g. `seo` — also its route segment. */
    namespace: string;
    /** i18n namespace + permission anchor. Same string as `namespace`. */
    permissionNamespace: string;
};

const PluginUiContext = React.createContext<PluginUiIdentity | null>(null);

export function PluginUiProvider({
    identity,
    children,
}: {
    identity: PluginUiIdentity;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <PluginUiContext.Provider value={identity}>{children}</PluginUiContext.Provider>
    );
}

export function useAstromechPlugin() {
    const identity = React.useContext(PluginUiContext);
    if (!identity) {
        throw new Error(
            '[Astromech] useAstromechPlugin() must be called from a component rendered ' +
                'inside a plugin surface (page, settings, or field renderer).'
        );
    }

    const { toast } = useToast();
    const confirm = useConfirm();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { t } = useTranslation(identity.permissionNamespace);

    return {
        plugin: identity.namespace,
        sdk: (Astromech.plugins as Record<string, unknown>)[identity.namespace],
        toast,
        modal: confirm,
        currentUser: user,
        navigate,
        t,
    };
}
