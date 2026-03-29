import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Input } from './input.js';

export type KeyValueEditorProps = {
    value?: Record<string, string>;
    onChange?: (value: Record<string, string>) => void;
    addLabel?: string;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
};

type PairWithId = { _id: string; key: string; value: string };

function recordToPairs(v: Record<string, string> | undefined): PairWithId[] {
    if (!v) return [];
    return Object.entries(v).map(([k, val]) => ({
        _id: crypto.randomUUID(),
        key: k,
        value: val,
    }));
}

function pairsToRecord(pairs: PairWithId[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const pair of pairs) {
        if (pair.key !== '') result[pair.key] = pair.value;
    }
    return result;
}

export function KeyValueEditor({
    value,
    onChange,
    addLabel = 'Add pair',
    keyPlaceholder = 'Key',
    valuePlaceholder = 'Value',
}: KeyValueEditorProps): React.ReactElement {
    const [pairs, setPairs] = useState<PairWithId[]>(() => recordToPairs(value));

    function handleChange(id: string, field: 'key' | 'value', val: string) {
        const next = pairs.map((p) => (p._id === id ? { ...p, [field]: val } : p));
        setPairs(next);
        onChange?.(pairsToRecord(next));
    }

    function handleAdd() {
        const next = [...pairs, { _id: crypto.randomUUID(), key: '', value: '' }];
        setPairs(next);
        onChange?.(pairsToRecord(next));
    }

    function handleRemove(id: string) {
        const next = pairs.filter((p) => p._id !== id);
        setPairs(next);
        onChange?.(pairsToRecord(next));
    }

    return (
        <div className="am-kv-editor">
            {pairs.length > 0 && (
                <div className="am-kv-editor-rows">
                    {pairs.map((pair) => (
                        <div key={pair._id} className="am-kv-editor-row">
                            <Input
                                type="text"
                                value={pair.key}
                                placeholder={keyPlaceholder}
                                onChange={(e) => handleChange(pair._id, 'key', e.target.value)}
                                aria-label={keyPlaceholder}
                            />
                            <Input
                                type="text"
                                value={pair.value}
                                placeholder={valuePlaceholder}
                                onChange={(e) => handleChange(pair._id, 'value', e.target.value)}
                                aria-label={valuePlaceholder}
                            />
                            <button
                                type="button"
                                className="am-kv-editor-remove"
                                onClick={() => handleRemove(pair._id)}
                                aria-label="Remove pair"
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
                className="am-repeater-btn am-repeater-btn-add"
            >
                {addLabel}
            </button>
        </div>
    );
}
