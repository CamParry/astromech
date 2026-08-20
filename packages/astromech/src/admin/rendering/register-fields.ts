/**
 * Field-input registry — core registrations. Side-effect module imported
 * once at the admin SPA entrypoint; registers the built-in field-input
 * components keyed by field type. Plugin field types register elsewhere.
 */
import { BlocksField } from '@/admin/components/fields/blocks-field';
import { BooleanField } from '@/admin/components/fields/boolean-field';
import { CheckboxGroupField } from '@/admin/components/fields/checkbox-group-field';
import { ColorField } from '@/admin/components/fields/color-field';
import { DateField } from '@/admin/components/fields/date-field';
import { DatetimeField } from '@/admin/components/fields/datetime-field';
import { EmailField } from '@/admin/components/fields/email-field';
import { GroupField } from '@/admin/components/fields/group-field';
import { JsonField } from '@/admin/components/fields/json-field';
import { KeyValueField } from '@/admin/components/fields/key-value-field';
import { LinkField } from '@/admin/components/fields/link-field';
import { MediaField } from '@/admin/components/fields/media-field';
import { MultiselectField } from '@/admin/components/fields/multiselect-field';
import { NumberField } from '@/admin/components/fields/number-field';
import { RadioGroupField } from '@/admin/components/fields/radio-group-field';
import { RangeField } from '@/admin/components/fields/range-field';
import { RelationshipField } from '@/admin/components/fields/relationship-field';
import { RepeaterField } from '@/admin/components/fields/repeater-field';
import { RichtextField } from '@/admin/components/fields/richtext-field';
import { SelectField } from '@/admin/components/fields/select-field';
import { SlugField } from '@/admin/components/fields/slug-field';
import { TextField } from '@/admin/components/fields/text-field';
import { TextareaField } from '@/admin/components/fields/textarea-field';
import { TreeField } from '@/admin/components/fields/tree-field';
import { UrlField } from '@/admin/components/fields/url-field';
import { registerField } from './field-registry';

registerField('text', TextField);
registerField('textarea', TextareaField);
registerField('richtext', RichtextField);
registerField('number', NumberField);
registerField('boolean', BooleanField);
registerField('date', DateField);
registerField('datetime', DatetimeField);
registerField('select', SelectField);
registerField('multiselect', MultiselectField);
registerField('media', MediaField);
registerField('relationship', RelationshipField);
registerField('repeater', RepeaterField);
registerField('email', EmailField);
registerField('url', UrlField);
registerField('color', ColorField);
registerField('slug', SlugField);
registerField('json', JsonField);
registerField('group', GroupField);
registerField('range', RangeField);
registerField('checkbox-group', CheckboxGroupField);
registerField('radio-group', RadioGroupField);
registerField('link', LinkField);
registerField('key-value', KeyValueField);
registerField('blocks', BlocksField);
registerField('tree', TreeField);
