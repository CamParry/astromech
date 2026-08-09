/**
 * Plugin UI context + `useAstromechPlugin()` (spec §8).
 *
 * The `/plugin/$` catch-all provides the identity of the plugin whose
 * surface is rendering; the hook hands plugin components their runtime
 * toolbox: `{ service, toast, modal, currentUser, navigate, t }`, with `t`
 * pre-scoped to the plugin's i18n namespace (= its derived namespace).
 */

import React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { astromechClient } from '@/transport/http/client/index';
import { useToast } from '@/admin/components/ui/index';
import { useConfirm } from '@/admin/components/ui/confirm';
import { useAuth } from '@/admin/context/auth';

export type PluginUiIdentity = {
    /** The plugin's derived namespace, e.g. `seo` — also its admin route segment. */
    namespace: string;
    /**
     * The plugin's derived service key, e.g. `acmeSeo` — the
     * `astromechClient.plugins.*` property. Supplied by whoever renders the
     * surface rather than computed from `namespace` here: the namespace →
     * service key derivation is lossy, so it cannot be run backwards, and
     * running it forwards in the browser would be a second implementation of a
     * rule the server already resolved.
     */
    serviceKey: string;
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
        /**
         * The `/api/plugins/<serviceKey>` route segment. Needed only to build a
         * URL for a raw (streaming) route by hand — RPC methods are already
         * bound on `service`. Exposed rather than derived because the
         * namespace → service key mapping is lossy in that direction.
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
