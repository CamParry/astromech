import React from 'react';
import type { FieldDefinition } from '@/types/index.js';
import { Input } from '@/admin/components/ui/input';
import { TextField } from './text-field';
import { TextareaField } from './textarea-field';
import { RichtextField } from './richtext-field';
import { NumberField } from './number-field';
import { BooleanField } from './boolean-field';
import { DateField } from './date-field';
import { DatetimeField } from './datetime-field';
import { SelectField } from './select-field';
import { MultiselectField } from './multiselect-field';
import { MediaField } from './media-field';
import { RelationshipField } from './relationship-field';
import { RepeaterField } from './repeater-field';
import { EmailField } from './email-field';
import { UrlField } from './url-field';
import { ColorField } from './color-field';
import { SlugField } from './slug-field';
import { JsonField } from './json-field';
import { GroupField } from './group-field';
import { RangeField } from './range-field';
import { CheckboxGroupField } from './checkbox-group-field';
import { RadioGroupField } from './radio-group-field';
import { LinkField } from './link-field';
import { KeyValueField } from './key-value-field';
import { AccordionField } from './accordion-field';
import { TabField } from './tab-field';

export type FieldInputProps = {
    field: FieldDefinition;
    value: unknown;
    name?: string;
    onChange: (name: string, value: unknown) => void;
};

export function FieldInput({ field, value, name, onChange }: FieldInputProps): React.ReactElement {
    const required = field.required ?? false;

    const commonProps = {
        name: name ?? field.name,
        value,
        field,
        required,
        onChange,
    };

    switch (field.type) {
        case 'text':
            return <TextField {...commonProps} />;
        case 'textarea':
            return <TextareaField {...commonProps} />;
        case 'richtext':
            return <RichtextField {...commonProps} />;
        case 'number':
            return <NumberField {...commonProps} />;
        case 'boolean':
            return <BooleanField {...commonProps} />;
        case 'date':
            return <DateField {...commonProps} />;
        case 'datetime':
            return <DatetimeField {...commonProps} />;
        case 'select':
            return <SelectField {...commonProps} />;
        case 'multiselect':
            return <MultiselectField {...commonProps} />;
        case 'media':
            return <MediaField {...commonProps} />;
        case 'relationship':
            return <RelationshipField {...commonProps} />;
        case 'repeater':
            return <RepeaterField {...commonProps} />;
        case 'email':
            return <EmailField {...commonProps} />;
        case 'url':
            return <UrlField {...commonProps} />;
        case 'color':
            return <ColorField {...commonProps} />;
        case 'slug':
            return <SlugField {...commonProps} />;
        case 'json':
            return <JsonField {...commonProps} />;
        case 'group':
            return <GroupField {...commonProps} />;
        case 'range':
            return <RangeField {...commonProps} />;
        case 'checkbox-group':
            return <CheckboxGroupField {...commonProps} />;
        case 'radio-group':
            return <RadioGroupField {...commonProps} />;
        case 'link':
            return <LinkField {...commonProps} />;
        case 'key-value':
            return <KeyValueField {...commonProps} />;
        case 'accordion':
            return <AccordionField {...commonProps} />;
        case 'tab':
            return <TabField {...commonProps} />;
        default:
            return (
                <Input
                    type="text"
                    name={field.name}
                    defaultValue={typeof value === 'string' ? value : ''}
                    required={required}
                    onChange={(e) => onChange(field.name, e.target.value)}
                />
            );
    }
}
