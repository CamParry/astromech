/**
 * Field-input registry — core registrations. Side-effect module imported
 * once at the admin SPA entrypoint; registers the built-in field-input
 * components keyed by field type. Plugin field types register elsewhere.
 */
import { BlocksField } from '../components/fields/blocks-field';
import { BooleanField } from '../components/fields/boolean-field';
import { CheckboxGroupField } from '../components/fields/checkbox-group-field';
import { ColorField } from '../components/fields/color-field';
import { DateField } from '../components/fields/date-field';
import { DatetimeField } from '../components/fields/datetime-field';
import { EmailField } from '../components/fields/email-field';
import { GroupField } from '../components/fields/group-field';
import { JsonField } from '../components/fields/json-field';
import { KeyValueField } from '../components/fields/key-value-field';
import { LinkField } from '../components/fields/link-field';
import { MediaField } from '../components/fields/media-field';
import { MultiselectField } from '../components/fields/multiselect-field';
import { NumberField } from '../components/fields/number-field';
import { RadioGroupField } from '../components/fields/radio-group-field';
import { RangeField } from '../components/fields/range-field';
import { RelationshipField } from '../components/fields/relationship-field';
import { RepeaterField } from '../components/fields/repeater-field';
import { RichtextField } from '../components/fields/richtext-field';
import { SelectField } from '../components/fields/select-field';
import { SlugField } from '../components/fields/slug-field';
import { TextField } from '../components/fields/text-field';
import { TextareaField } from '../components/fields/textarea-field';
import { TreeField } from '../components/fields/tree-field';
import { UrlField } from '../components/fields/url-field';
import { registerField } from './field-registry';

registerField('text', TextField);
registerField('textarea', TextareaField);
registerField('richtext', RichtextField, { labelElement: 'span' });
registerField('number', NumberField);
registerField('boolean', BooleanField, { labelElement: 'span' });
registerField('date', DateField);
registerField('datetime', DatetimeField);
registerField('select', SelectField);
registerField('multiselect', MultiselectField);
registerField('media', MediaField, { labelElement: 'span' });
registerField('relationship', RelationshipField);
registerField('repeater', RepeaterField, { labelElement: 'span' });
registerField('email', EmailField);
registerField('url', UrlField);
registerField('color', ColorField);
registerField('slug', SlugField);
registerField('json', JsonField);
registerField('group', GroupField, { labelElement: 'span' });
registerField('range', RangeField, { labelElement: 'span' });
registerField('checkbox-group', CheckboxGroupField, { labelElement: 'span' });
registerField('radio-group', RadioGroupField, { labelElement: 'span' });
registerField('link', LinkField, { labelElement: 'span' });
registerField('key-value', KeyValueField, { labelElement: 'span' });
registerField('blocks', BlocksField, { labelElement: 'span' });
registerField('tree', TreeField, { labelElement: 'span' });
