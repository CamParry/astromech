import { Combobox } from '@base-ui/react/combobox';
import React, { useState, useEffect, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { BaseFieldProps } from '@/types/index.js';
import { Astromech } from '@/sdk/client/index.js';
import './combobox.css';
import { CheckIcon, XIcon } from 'lucide-react';

type EntryOption = {
    id: string;
    title: string;
    slug: string | null;
};

export function RelationField({
    name,
    value,
    field,
    required,
    onChange,
}: BaseFieldProps) {
    const { t } = useTranslation();
    const target = field.target || '';
    const multiple = field.multiple || false;
    const containerRef = useRef<HTMLDivElement | null>(null);
    const id = useId();
    const [options, setOptions] = useState<EntryOption[]>([]);

    useEffect(() => {
        if (!target) return;
        Astromech.collections[target]!.all()
            .then((entries) => {
                setOptions(
                    entries.map((e) => ({ id: e.id, title: e.title, slug: e.slug }))
                );
            })
            .catch(() => {
                // silently ignore fetch errors — options remain empty
            });
    }, [target]);

    return (
        <Combobox.Root
            items={options}
            multiple={multiple}
            name={name}
            required={!!required}
            itemToStringValue={(item: EntryOption) => item.id}
            itemToStringLabel={(item: EntryOption) => item.title}
            onValueChange={(val: EntryOption | EntryOption[] | null) => {
                if (val === null) {
                    onChange(name, null);
                } else if (Array.isArray(val)) {
                    onChange(
                        name,
                        val.map((v) => v.id)
                    );
                } else {
                    onChange(name, val.id);
                }
            }}
        >
            <div className="am-combobox">
                <Combobox.Chips className="am-combobox__chips" ref={containerRef}>
                    <Combobox.Value>
                        {(val: EntryOption | EntryOption[] | null) => {
                            const selected =
                                val == null ? [] : Array.isArray(val) ? val : [val];
                            return (
                                <React.Fragment>
                                    {selected.map((v) => (
                                        <Combobox.Chip
                                            key={v.id}
                                            className="am-combobox__chip"
                                            aria-label={v.title}
                                        >
                                            {v.title}
                                            <Combobox.ChipRemove
                                                className="am-combobox__chip-remove"
                                                aria-label={t('fields.relationRemove')}
                                            >
                                                <XIcon size={16} />
                                            </Combobox.ChipRemove>
                                        </Combobox.Chip>
                                    ))}
                                    <Combobox.Input
                                        id={id}
                                        placeholder={
                                            selected.length > 0
                                                ? ''
                                                : t('fields.relationSelect')
                                        }
                                        className="am-combobox__input"
                                    />
                                </React.Fragment>
                            );
                        }}
                    </Combobox.Value>
                </Combobox.Chips>
            </div>
            <Combobox.Portal>
                <Combobox.Positioner
                    className="am-combobox__positioner"
                    sideOffset={4}
                    anchor={containerRef}
                >
                    <Combobox.Popup className="am-combobox__popup">
                        <Combobox.Empty className="am-combobox__empty">
                            {t('fields.relationNoResults')}
                        </Combobox.Empty>
                        <Combobox.List>
                            {(option: EntryOption) => (
                                <Combobox.Item
                                    key={option.id}
                                    className="am-combobox__item"
                                    value={option}
                                >
                                    <Combobox.ItemIndicator className="am-combobox__item-indicator">
                                        <CheckIcon className="am-combobox__item-indicator-icon" />
                                    </Combobox.ItemIndicator>
                                    <div className="am-combobox__item-text">
                                        {option.title}
                                    </div>
                                </Combobox.Item>
                            )}
                        </Combobox.List>
                    </Combobox.Popup>
                </Combobox.Positioner>
            </Combobox.Portal>
        </Combobox.Root>
    );
}
