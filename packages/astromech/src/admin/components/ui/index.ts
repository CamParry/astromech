import { assertSingleUiInstance } from '@/admin/support/ui-instance-guard';

assertSingleUiInstance(import.meta.url);

export { Button } from './button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './button';

export { Input } from './input';
export type { InputProps } from './input';

export { Textarea } from './textarea';
export type { TextareaProps } from './textarea';

export { Select } from './select';
export type { SelectProps, SelectOption as SelectOptionType } from './select';

export { Checkbox } from './checkbox';
export type { CheckboxProps } from './checkbox';

export { Toggle } from './toggle';
export type { ToggleProps } from './toggle';

export { Badge } from './badge';
export type { BadgeProps, BadgeVariant } from './badge';

export { Modal, ConfirmModal } from './modal';
export type { ModalProps, ConfirmModalProps } from './modal';

export { ConfirmProvider, useConfirm } from './confirm';
export type { ConfirmOptions } from './confirm';

export { Dropdown } from './dropdown';
export type { DropdownProps, DropdownItem } from './dropdown';

export { ToastProvider, useToast } from './toast';
export type { ToastOptions, ToastVariant } from './toast';

export { Panel } from './panel';
export type { PanelProps } from './panel';

export { Table } from './table';

export { Toolbar, ToolbarStart, ToolbarEnd } from './toolbar';
export { SearchInput } from './search-input';
export { ContentGrid } from './content-grid';

export { Tabs } from './tabs';
export type { Tab, TabsProps } from './tabs';

export { Breadcrumb } from './breadcrumb';
export type { BreadcrumbItem, BreadcrumbProps } from './breadcrumb';

export { Spinner, Skeleton } from './spinner';
export type { SpinnerProps, SkeletonProps } from './spinner';

export { EmptyState } from './empty-state';
export type { EmptyStateProps } from './empty-state';

export { Avatar } from './avatar';
export type { AvatarProps } from './avatar';

export { Tooltip } from './tooltip';
export type { TooltipProps } from './tooltip';

export {
    Page,
    PageHeader,
    PageHeaderActions,
    PageTitle,
    PageContent,
    SectionTitle,
    FormLayout,
    FormLayoutActions,
    FormLayoutContent,
    Stack,
    ButtonGroup,
    PageLoading,
} from './page';

export { ContextMenu, useContextMenu } from './context-menu';
export type { ContextMenuProps } from './context-menu';

export {
    CommandPaletteProvider,
    CommandPalette,
    useCommandPalette,
} from './command-palette';

export { NumberField } from './number-field';
export type { NumberFieldProps } from './number-field';

export { Slider } from './slider';
export type { SliderProps } from './slider';

export { Progress } from './progress';
export type { ProgressProps } from './progress';

export { Accordion } from './accordion';
export type { AccordionProps, AccordionItem } from './accordion';

export { Collapsible } from './collapsible';
export type { CollapsibleProps } from './collapsible';

export { Combobox } from './combobox';
export type { ComboboxProps, ComboboxOption } from './combobox';

export { MultiSelect } from './multi-select';
export type { MultiSelectProps, MultiSelectOption } from './multi-select';

export { RadioGroup } from './radio-group';
export type { RadioGroupProps, RadioGroupOption } from './radio-group';

export { ColorPicker } from './color-picker';
export type { ColorPickerProps } from './color-picker';

export { KeyValueEditor } from './key-value-editor';
export type { KeyValueEditorProps } from './key-value-editor';

export { RichTextEditor } from './rich-text-editor';
export type { RichTextEditorProps } from './rich-text-editor';

export { RangeInput } from './range-input';
export type { RangeInputProps } from './range-input';

export { CheckboxGroup } from './checkbox-group';
export type { CheckboxGroupProps, CheckboxGroupOption } from './checkbox-group';

export { ApiErrorPanel, dispatchApiErrorEvent } from './api-error-panel';
export type { ApiErrorEventDetail } from './api-error-panel';

export { UploadButton } from './upload-button';
export type { UploadButtonProps } from './upload-button';

export { ToggleGroup } from './toggle-group';
export type { ToggleGroupProps, ToggleGroupItem } from './toggle-group';

export { DropZone } from './drop-zone';
export type { DropZoneProps } from './drop-zone';

export { UploadZone } from './upload-zone';

export { Pagination } from './pagination';
export type { PaginationProps } from './pagination';

// Plugin runtime context hook (spec §8) — only usable inside plugin surfaces.
export { useAstromechPlugin } from '../../context/plugin';

// Sibling-value access for custom field renderers (e.g. computed/preview fields).
export { useFieldValue } from '../fields/field-context';

// AI context: declare what a surface is showing, or read what every surface declared.
export { useAIContext, useAIContextItems } from '../../context/ai-context';
export type { AIContextItem } from '@/types/ai-context';
