/**
 * User edit page.
 *
 * Form with name field (editable) and email field (read-only). `users.fields`
 * is a declared field tree exactly like a global's, so it renders through the
 * same `useEntryForm`/`EntryFieldColumn` building blocks the global edit page
 * uses — a translatable config adds a locale switcher above it. A metadata
 * sidebar shows joined date and last updated.
 */

import type { EntryPayload } from '../../hooks/use-entry-form';
import type { User, UserUpdateData } from 'astromech';
import { useStore } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { useAiContext } from '../../context/ai-context';
import { useAuth } from '../../context/auth';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { useEntryForm } from '../../hooks/use-entry-form';
import { usePermissions } from '../../hooks/use-permissions';
import { userMutations, useUser } from '../../hooks/users';
import { EntryNamespaceProvider, labelNamespace } from '../../i18n/entry-namespace';
import { defaultContentLocale, localeOptions } from '../../utilities/content-locale';
import { EntryFormLayout, FieldColumn } from '../entries/entry-form-fields';
import { Breadcrumb } from '../ui/breadcrumb';
import { Button } from '../ui/button';
import { useConfirm } from '../ui/confirm';
import { Input } from '../ui/input';
import {
    ButtonGroup,
    Page,
    PageContent,
    PageHeader,
    PageLoading,
    PageTitle,
    Stack,
} from '../ui/page';
import { Panel } from '../ui/panel';
import { Select } from '../ui/select';
import { UserSummaryPanel } from './user-summary-panel';
import { UserVersionsPanel } from './user-versions-panel';

export type UserEditPageProps = {
    id: string;
};

export function UserEditPage({ id }: UserEditPageProps): React.ReactElement {
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
    const { canReadUsers } = usePermissions();

    const isSelf = currentUser?.id === id;

    // The page is addressed by `/:id` alone, so the locale being edited is
    // its own state rather than a search param.
    const [locale, setLocale] = useState(defaultContentLocale);
    const { data: user, isLoading } = useUser(id, locale);

    useEffect(() => {
        if (!canReadUsers() && !isSelf) {
            void navigate({ to: '/' });
        }
    }, []);

    if (isLoading || user == null) {
        return <PageLoading />;
    }

    return (
        <UserEditBody
            // Keyed on the record and the locale read: one form instance per
            // set of values. Without this a touched form keeps the previous
            // ones and saves them onto the next.
            key={`${user.id}:${user.locale}:${locale}`}
            id={id}
            user={user}
            locale={locale}
            onLocaleChange={setLocale}
            isSelf={isSelf}
        />
    );
}

type UserEditBodyProps = {
    id: string;
    user: User;
    /** The locale being edited, which `user.locale` falls back from. */
    locale: string;
    onLocaleChange: (locale: string) => void;
    isSelf: boolean;
};

/** The loaded page. Split out so `key` can remount it per record and locale. */
function UserEditBody({
    id,
    user,
    locale,
    onLocaleChange,
    isSelf,
}: UserEditBodyProps): React.ReactElement {
    const confirm = useConfirm();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { canUpdateUsers, canDeleteUsers } = usePermissions();
    const namespace = labelNamespace(undefined);

    const isTranslatable =
        adminConfig.users.translatable && adminConfig.locales.length > 1;
    const fieldDefinitions = adminConfig.users.fields;
    const canEditRole = canUpdateUsers() && !isSelf;
    const canSave = canUpdateUsers() || isSelf;

    // Declare the user in view. A blank name falls back to the email, which
    // every user has.
    useAiContext(
        { kind: 'users', id, label: user.name !== '' ? user.name : user.email },
        { depth: 1 }
    );

    // `role` sits outside the field tree `useEntryForm` manages (account-level,
    // like `name`/`title`), so it keeps its own state and dirty check.
    const [role, setRole] = useState(user.role);
    const roleDirty = role !== user.role;

    const updateMutation = useAdminMutation(userMutations().update);

    const deleteMutation = useAdminMutation(userMutations().delete, {
        onSuccess: () => void navigate({ to: '/users' }),
    });

    /**
     * `useEntryForm` builds one payload shaped for entries and globals
     * (`title`, `fields`, ...); `name` rides in as its `title` and `role`
     * merges in from its own state. Both write through `userMutations().update`,
     * so cache invalidation and the saved toast stay the table's job.
     */
    async function writeUser(payload: EntryPayload): Promise<User> {
        const data: UserUpdateData = { name: payload.title, fields: payload.fields };
        if (canEditRole) data.role = role;
        return updateMutation.mutateAsync({
            id,
            locale: isTranslatable ? locale : undefined,
            data,
        });
    }

    const entryForm = useEntryForm<User>({
        fieldDefinitions,
        operation: 'update',
        namespace,
        defaultValues: {
            title: user.name,
            fields: user.fields,
        },
        hasSlug: false,
        hasStatuses: false,
        readOnly: !canSave,
        saveFn: writeUser,
        publishFn: writeUser,
    });
    const { form, saveMutation, handleSave } = entryForm;

    // `form.state` is a plain getter — reading it in render never re-renders on
    // change, which left Save permanently disabled. Subscribe to the store.
    const isDirty = useStore(form.store, (state) => state.isDirty) || roleDirty;

    return (
        <EntryNamespaceProvider namespace={namespace}>
            <Page>
                <PageHeader>
                    <PageTitle>
                        {user.name !== '' ? user.name : t('users.editUser')}
                    </PageTitle>
                    <Breadcrumb
                        items={[
                            { label: t('users.title'), to: '/users' },
                            { label: user.name !== '' ? user.name : t('users.editUser') },
                        ]}
                    />
                </PageHeader>

                <PageContent>
                    <EntryFormLayout
                        state={entryForm}
                        main={
                            <>
                                <Panel title={t('users.profilePanel')}>
                                    <Stack gap={5}>
                                        <form.Field
                                            name="title"
                                            validators={{
                                                onChange: ({ value }) =>
                                                    value.trim() === ''
                                                        ? t('users.nameRequired')
                                                        : undefined,
                                            }}
                                        >
                                            {(field) => (
                                                <div className="am-field">
                                                    <label
                                                        className="am-field-label"
                                                        htmlFor="user-name"
                                                    >
                                                        {t('users.nameField')}
                                                    </label>
                                                    <Input
                                                        id="user-name"
                                                        type="text"
                                                        value={field.state.value}
                                                        onChange={(e) =>
                                                            field.handleChange(
                                                                e.target.value
                                                            )
                                                        }
                                                        onBlur={field.handleBlur}
                                                        required
                                                    />
                                                    {field.state.meta.errors.length >
                                                        0 && (
                                                        <p className="am-field-error">
                                                            {field.state.meta.errors[0]}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </form.Field>

                                        <div className="am-field">
                                            <label
                                                className="am-field-label"
                                                htmlFor="user-email"
                                            >
                                                {t('users.emailField')}
                                            </label>
                                            <Input
                                                id="user-email"
                                                type="email"
                                                value={user.email}
                                                readOnly
                                                disabled
                                                hint={t('users.emailReadonly')}
                                            />
                                        </div>

                                        {canEditRole && (
                                            <div className="am-field">
                                                <label
                                                    className="am-field-label"
                                                    htmlFor="user-role"
                                                >
                                                    {t('users.roleField')}
                                                </label>
                                                <Select
                                                    id="user-role"
                                                    value={role}
                                                    onValueChange={(v) =>
                                                        setRole(v ?? '')
                                                    }
                                                    options={adminConfig.roles.map(
                                                        (r) => ({
                                                            value: r.slug,
                                                            label: r.name,
                                                        })
                                                    )}
                                                />
                                            </div>
                                        )}
                                    </Stack>
                                </Panel>

                                {(isTranslatable || fieldDefinitions.length > 0) && (
                                    <Panel
                                        {...(fieldDefinitions.length > 0
                                            ? { title: t('users.fieldsPanel') }
                                            : {})}
                                    >
                                        <Stack gap={5}>
                                            {isTranslatable && (
                                                <div className="am-content-locale">
                                                    <Select
                                                        value={locale}
                                                        onValueChange={(value) => {
                                                            if (value !== null)
                                                                onLocaleChange(value);
                                                        }}
                                                        options={localeOptions(
                                                            user.locales
                                                        )}
                                                    />
                                                    {locale !== user.locale && (
                                                        <p className="am-text-muted am-text-sm">
                                                            {t(
                                                                'users.translationFallbackHint',
                                                                {
                                                                    locale: user.locale.toUpperCase(),
                                                                }
                                                            )}
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            <FieldColumn
                                                form={form}
                                                nodes={fieldDefinitions}
                                                disabled={!canSave}
                                            />
                                        </Stack>
                                    </Panel>
                                )}

                                {/* `user.locale` is the row that was read:
                                            a locale with no row has no versions to
                                            list. */}
                                <UserVersionsPanel
                                    userId={id}
                                    locale={user.locale}
                                    canUpdate={canUpdateUsers()}
                                />
                            </>
                        }
                        sidebar={
                            <>
                                <Panel title={t('users.actionsPanel')}>
                                    <ButtonGroup>
                                        {canSave && (
                                            <Button
                                                onClick={handleSave}
                                                loading={saveMutation.isPending}
                                                disabled={
                                                    !isDirty || saveMutation.isPending
                                                }
                                            >
                                                {t('common.save')}
                                            </Button>
                                        )}
                                        {canDeleteUsers() && (
                                            <Button
                                                variant="danger"
                                                onClick={() =>
                                                    confirm({
                                                        title: t(
                                                            'users.confirmDeleteTitle'
                                                        ),
                                                        description: t(
                                                            'users.confirmDeleteMessage',
                                                            { name: user.name }
                                                        ),
                                                        confirmLabel: t('common.delete'),
                                                        onConfirm: () =>
                                                            deleteMutation.mutate(id),
                                                    })
                                                }
                                                loading={deleteMutation.isPending}
                                            >
                                                {t('common.delete')}
                                            </Button>
                                        )}
                                    </ButtonGroup>
                                </Panel>

                                <UserSummaryPanel user={user} />
                            </>
                        }
                    />
                </PageContent>
            </Page>
        </EntryNamespaceProvider>
    );
}
