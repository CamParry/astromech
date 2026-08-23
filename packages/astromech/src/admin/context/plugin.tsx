/**
 * Plugin UI context and `useAstromechPlugin()`. The `/plugin/$` catch-all
 * provides the plugin identity; the hook hands plugin components their
 * runtime toolbox (service, toast, modal, currentUser, navigate, t).
 */

import { useNavigate } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '@/admin/components/ui/confirm';
import { useToast } from '@/admin/components/ui/toast';
import { useAuth } from '@/admin/context/auth';
import { astromechClient } from '@/transport/http/client/index';

export type PluginUiIdentity = {
    /** The plugin's derived namespace, e.g. `seo` — also its admin route segment. */
    namespace: string;
    /**
     * The plugin's derived service key, e.g. `acmeSeo` — the
     * `astromechClient.plugins.*` property. Supplied by the renderer rather
     * than derived here, since namespace → service key is lossy to invert.
     */
    serviceKey: string;
    /** i18n namespace + permission anchor. Same string as `namespace`. */
    permissionNamespace: string;
};

const PluginUiContext = React.createContext<PluginUiIdentity | null>(null);

/** Provides the identity of the plugin whose surface is rendering. */
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

/** A plugin component's runtime toolbox: service, toast, modal, currentUser, navigate, t. */
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
        /**
         * The `/api/plugins/<serviceKey>` route segment, for building a raw
         * (streaming) route URL by hand; RPC methods are already bound on `service`.
         */
        serviceKey: identity.serviceKey,
        service: (astromechClient.plugins as Record<string, unknown>)[
            identity.serviceKey
        ],
        toast,
        modal: confirm,
        currentUser: user,
        navigate,
        t,
    };
}
