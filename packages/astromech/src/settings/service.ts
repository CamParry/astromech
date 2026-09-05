/**
 * Settings service — the settings verbs (all / get / set) over the naked
 * key-value class. A thin assembler: it wires `methods/**` into the
 * `SettingsService` definition, and the public/private key visibility rule
 * lives there.
 */

import type { SettingsService } from '@/types/index';
import { defineService } from '@/services/define-service';
import { allSettings } from './methods/all';
import { getSetting } from './methods/get';
import { setSetting } from './methods/set';

export const settingsDefinition = defineService<SettingsService>('settings', {
    all: allSettings,
    get: getSetting,
    set: setSetting,
});
