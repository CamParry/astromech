/**
 * i18next initialisation for the Astromech admin SPA.
 *
 * Import this module once at the SPA entry point. After that, use the
 * `useTranslation` hook or `t()` helper from `react-i18next` anywhere.
 *
 * Plugin locale bundles (spec §3.11) lazy-load from the code-gen
 * `virtual:astromech/plugins/components` i18n map into per-plugin
 * namespaces (= permissionNamespace); fallback follows core (`en`).
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { i18n as pluginLocales } from 'virtual:astromech/plugins/components';
import en from './locales/en.json';

void i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: { translation: en },
    },
    interpolation: {
        // React already escapes values
        escapeValue: false,
    },
});

/** Load every plugin's bundle for a language into its own namespace. */
async function loadPluginBundles(language: string): Promise<void> {
    await Promise.all(
        Object.entries(pluginLocales).map(async ([namespace, locales]) => {
            const thunk = locales[language];
            if (!thunk || i18n.hasResourceBundle(language, namespace)) return;
            try {
                const mod = await thunk();
                i18n.addResourceBundle(language, namespace, mod.default ?? mod);
            } catch (error) {
                console.error(
                    `[Astromech] Failed to load "${language}" locale for plugin namespace "${namespace}"`,
                    error
                );
            }
        })
    );
}

void loadPluginBundles('en');
i18n.on('languageChanged', (language) => {
    void loadPluginBundles(language);
});

export default i18n;
