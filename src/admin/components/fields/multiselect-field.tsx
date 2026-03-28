import { Combobox } from '@base-ui/react/combobox';
import React, { useRef, useId } from 'react';
import type { BaseFieldProps, SelectOption } from '@/types/index.js';
import { CheckIcon, XIcon } from 'lucide-react';
import './combobox.css';

export function MultiselectField({ name, value, field, required, onChange }: BaseFieldProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const id = useId();

	const selectedValues = Array.isArray(value) ? value.map(String) : [];

	const options: SelectOption[] =
		field.options?.map((opt) => {
			if (typeof opt === 'string') {
				return { value: opt, label: opt };
			}
			return opt;
		}) || [];

	const currentValue = options.filter((opt) => selectedValues.includes(opt.value));

	return (
		<Combobox.Root
			items={options}
			multiple={true}
			name={name}
			value={currentValue}
			onValueChange={(val: SelectOption[]) => onChange(name, val.map((v) => v.value))}
			required={!!required}
		>
			<div className="am-combobox">
				<Combobox.Chips className="am-combobox-chips" ref={containerRef}>
					<Combobox.Value>
						{(val: SelectOption[]) => (
							<React.Fragment>
								{val.map((v) => (
									<Combobox.Chip
										key={v.value}
										className="am-combobox-chip"
										aria-label={v.label}
									>
										{v.label}
										<Combobox.ChipRemove
											className="am-combobox-chip-remove"
											aria-label="Remove"
										>
											<XIcon size={16} />
										</Combobox.ChipRemove>
									</Combobox.Chip>
								))}
								<Combobox.Input
									id={id}
									placeholder={val.length > 0 ? '' : 'Select...'}
									className="am-combobox-input"
								/>
							</React.Fragment>
						)}
					</Combobox.Value>
				</Combobox.Chips>
			</div>
			<Combobox.Portal>
				<Combobox.Positioner
					className="am-combobox-positioner"
					sideOffset={4}
					anchor={containerRef}
				>
					<Combobox.Popup className="am-combobox-popup">
						<Combobox.Empty className="am-combobox-empty">No results.</Combobox.Empty>
						<Combobox.List>
							{(option: SelectOption) => (
								<Combobox.Item
									key={option.value}
									className="am-combobox-item"
									value={option}
								>
									<Combobox.ItemIndicator className="am-combobox-item-indicator">
										<CheckIcon className="am-combobox-item-indicator-icon" />
									</Combobox.ItemIndicator>
									<div className="am-combobox-item-text">{option.label}</div>
								</Combobox.Item>
							)}
						</Combobox.List>
					</Combobox.Popup>
				</Combobox.Positioner>
			</Combobox.Portal>
		</Combobox.Root>
	);
}
