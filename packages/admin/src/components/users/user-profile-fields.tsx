/**
 * The labelled inputs of a user's profile panel (name, email and role),
 * shared by the create and edit pages.
 */
import type { InputProps } from '../ui/input';
import React from 'react';
import adminConfig from 'virtual:astromech/admin-config';
import { Input } from '../ui/input';
import { Select } from '../ui/select';

/**
 * The part of a TanStack `FieldApi` over a string value that these inputs
 * read, so a `form.Field` render prop's `field` passes in as it is.
 */
type StringFieldApi = {
    state: { value: string; meta: { errors: readonly React.ReactNode[] } };
    handleChange: (value: string) => void;
    handleBlur: () => void;
};

/** Props for `UserTextField`: the input's own props, a label and a form field. */
export type UserTextFieldProps = Omit<InputProps, 'id' | 'label'> & {
    id: string;
    label: string;
    /** The form field the input is bound to; left out for a read-only value. */
    field?: StringFieldApi;
};

/** A labelled text input with its first error below it. */
export function UserTextField({
    id,
    label,
    field,
    ...props
}: UserTextFieldProps): React.ReactElement {
    const errors = field?.state.meta.errors ?? [];
    return (
        <div className="am-field">
            <label className="am-field-label" htmlFor={id}>
                {label}
            </label>
            <Input
                id={id}
                {...(field !== undefined && {
                    value: field.state.value,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        field.handleChange(e.target.value),
                    onBlur: field.handleBlur,
                })}
                {...props}
            />
            {errors.length > 0 && <p className="am-field-error">{errors[0]}</p>}
        </div>
    );
}

/** Props for `UserRoleField`. */
export type UserRoleFieldProps = {
    label: string;
    field: Pick<StringFieldApi, 'state' | 'handleChange'>;
};

/** A labelled select over the configured roles. */
export function UserRoleField({ label, field }: UserRoleFieldProps): React.ReactElement {
    return (
        <div className="am-field">
            <label className="am-field-label" htmlFor="user-role">
                {label}
            </label>
            <Select
                id="user-role"
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v ?? '')}
                options={adminConfig.roles.map((r) => ({ value: r.slug, label: r.name }))}
            />
        </div>
    );
}

/** A `form.Field` change validator that reports `message` for a blank value. */
export function requiredValidator(
    message: string
): (props: { value: string }) => string | undefined {
    return ({ value }) => (value.trim() === '' ? message : undefined);
}
