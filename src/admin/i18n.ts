/**
 * i18next initialisation for the Astromech admin SPA.
 *
 * Import this module once at the SPA entry point. After that, use the
 * `useTranslation` hook or `t()` helper from `react-i18next` anywhere.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

i18n.use(initReactI18next).init({
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

export default i18n;
