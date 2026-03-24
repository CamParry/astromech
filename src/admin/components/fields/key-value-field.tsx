import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import type { BaseFieldProps } from '@/types/index.js';
import { Input } from '@/admin/components/ui/input';
import './key-value-field.css';

type PairWithId = {
    _id: string;
    key: string;
    value: string;
};

function recordToPairs(v: unknown): PairWithId[] {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        return Object.entries(v as Record<string, unknown>).map(([k, val]) => ({
            _id: crypto.randomUUID(),
            key: k,
            value: typeof val === 'string' ? val : String(val),
        }));
    }
    return [];
}

function pairsToRecord(pairs: PairWithId[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const pair of pairs) {
        if (pair.key !== '') {
            result[pair.key] = pair.value;
        }
    }
    return result;
}

export function KeyValueField({ name, value, onChange }: BaseFieldProps) {
    const { t } = useTranslation();
    const [pairs, setPairs] = useState<PairWithId[]>(() => recordToPairs(value));

    function handleChange(id: string, field: 'key' | 'value', val: string) {
        const next = pairs.map((p) => (p._id === id ? { ...p, [field]: val } : p));
        setPairs(next);
        onChange(name, pairsToRecord(next));
    }

    function handleAdd() {
        const next = [...pairs, { _id: crypto.randomUUID(), key: '', value: '' }];
        setPairs(next);
        onChange(name, pairsToRecord(next));
    }

    function handleRemove(id: string) {
        const next = pairs.filter((p) => p._id !== id);
        setPairs(next);
        onChange(name, pairsToRecord(next));
    }

    return (
        <div className="am-kv-field">
            {pairs.length > 0 && (
                <div className="am-kv-field__rows">
                    {pairs.map((pair) => (
                        <div key={pair._id} className="am-kv-field__row">
                            <Input
                                type="text"
                                value={pair.key}
                                placeholder={t('fields.kvKey')}
                                className="am-kv-field__input"
                                onChange={(e) => handleChange(pair._id, 'key', e.target.value)}
                                aria-label={t('fields.kvKey')}
                            />
                            <Input
                                type="text"
                                value={pair.value}
                                placeholder={t('fields.kvValue')}
                                className="am-kv-field__input"
                                onChange={(e) => handleChange(pair._id, 'value', e.target.value)}
                                aria-label={t('fields.kvValue')}
                            />
                            <button
                                type="button"
                                className="am-kv-field__remove"
                                onClick={() => handleRemove(pair._id)}
                                aria-label={t('fields.kvRemovePair')}
                            >
                                <Trash2 size={15} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <button
                type="button"
                onClick={handleAdd}
                className="am-repeater__btn am-repeater__btn--add"
            >
                {t('fields.kvAddPair')}
            </button>
        </div>
    );
}
