/**
 * Plugin UI context and `useAstromechPlugin()`. The `/plugin/$` catch-all
 * provides the plugin identity; the hook hands plugin components their
 * runtime toolbox (service, rawRouteUrl, toast, confirm, currentUser, navigate, t).
 */

import { useNavigate } from '@tanstack/react-router';
import { astromechUntypedClient } from 'astromech/fetch';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../components/ui/confirm';
import { useToast } from '../components/ui/toast';
import { useAuth } from './auth';

export type PluginUiIdentity = {
    /** The plugin's derived namespace, e.g. `seo` — also its admin route segment. */
    namespace: string;
    /**
     * The plugin's derived service key, e.g. `acmeSeo` — the
     * `astromechUntypedClient.plugins.*` property. Supplied by the renderer rather
     * than derived here, since namespace → service key is lossy to invert.
     */
    serviceKey: string;
    /** i18n namespace + permission anchor. Same string as `namespace`. */
    permissionNamespace: string;
};

declare const __ASTROMECH_BASE_PATH__: string;

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

/**
 * A plugin component's runtime toolbox: service, rawRouteUrl, toast, confirm,
 * currentUser, navigate, t.
 */
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
    const { serviceKey } = identity;
    const rawRouteUrl = React.useCallback(
        (path: string) => `${__ASTROMECH_BASE_PATH__}/api/plugins/${serviceKey}${path}`,
        [serviceKey]
    );

    return {
        plugin: identity.namespace,
        /** The `astromechUntypedClient.plugins` key and `/api/plugins/` route segment. */
        serviceKey,
        service: (astromechUntypedClient.plugins as Record<string, unknown>)[serviceKey],
        /**
         * The URL of one of this plugin's raw routes, for the requests `service`
         * cannot make (streaming, binary): `path` as the route declares it, with
         * its `:name` segments filled in, e.g. `rawRouteUrl('/runs/run_1/download')`.
         */
        rawRouteUrl,
        toast,
        confirm,
        currentUser: user,
        navigate,
        t,
    };
}
