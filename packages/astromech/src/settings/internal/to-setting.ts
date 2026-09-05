import type { SettingRow } from '../tables';
import type { Setting } from '@/types/index';

/** One stored row as the shape every settings method answers with. */
export function toSetting(row: SettingRow): Setting {
    return {
        key: row.key,
        value: row.value ?? null,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy ?? null,
    };
}
