/**
 * i18next initialisation for the Astromech admin SPA, imported once at the
 * entry point. Plugin locale bundles lazy-load into per-plugin namespaces
 * (keyed by permissionNamespace), falling back to core `en`.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { i18n as pluginLocales } from 'virtual:astromech/plugins/components';
import en from './locales/en.json';

void i18n.use(initReactI18next).init({
    lng: adminConfig.defaultLocale,
    fallbackLng: 'en',
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    cleanCode: true,
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
