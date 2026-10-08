/**
 * The admin resource contract: what a plugin declares under `admin.resources`,
 * what each of its methods receives, and the form the admin config carries.
 */

import type { Field, Label } from '@/types/fields';
import type { SortOption } from '@/types/query';

/**
 * A list column of an admin resource: a top-level field name, or the name with
 * `sortable: true` when the list method accepts a sort on it.
 */
export type AdminResourceColumn = string | { field: string; sortable?: boolean };

/**
 * An admin resource: list, create and edit screens over a plugin's own service
 * methods, declared under `admin.resources`. Each method name is a key of the
 * plugin's `service`, and each such method declares `access: { permission }`.
 */
export type AdminResource = {
    /** The URL key, `/plugin/<namespace>/resources/<name>`: lowercase words joined by `-`. */
    name: string;
    /** The plural label: the sidebar item and the list's title. */
    label: Label;
    labelSingular: Label;
    /** Lucide icon name for the sidebar item. */
    icon?: string;
    /** The fields the create and edit forms render, and the columns name. */
    fields: Field[];
    /** The fields the list shows, in order. */
    columns: AdminResourceColumn[];
    /**
     * The service methods behind each view. Without `get` rows do not open, and
     * without `update` the edit screen is read-only.
     */
    methods: {
        list: string;
        get?: string;
        create?: string;
        update?: string;
        delete?: string;
    };
    /** Whether the resource appears in the sidebar. Default true. */
    nav?: boolean;
    /** Whether the list shows a search box, passed to the list method as `search`. Default false. */
    search?: boolean;
};

/** The id a resource row is addressed by, beside its field values. */
export type AdminResourceRow = { id: string } & Record<string, unknown>;

/** What a resource's `list` method receives; it answers a `QueryResult<AdminResourceRow>`. */
export type AdminResourceListInput = {
    search?: string | undefined;
    sort?: SortOption | undefined;
    /** The page, from 1. */
    page: number;
    limit: number;
};

/** What a resource's `get` method receives; it answers the row, or `null` when there is none. */
export type AdminResourceGetInput = { id: string };

/** What a resource's `create` method receives, the form's field values; it answers the row. */
export type AdminResourceCreateInput = { data: Record<string, unknown> };

/** What a resource's `update` method receives; it answers the saved row. */
export type AdminResourceUpdateInput = { id: string; data: Record<string, unknown> };

/** What a resource's `delete` method receives; its answer is ignored. */
export type AdminResourceDeleteInput = { id: string };

/** One of an admin resource's methods, with the permission it declares resolved. */
export type ResolvedAdminResourceMethod = {
    /** The method's key in the plugin's `service`. */
    name: string;
    permission: string;
};

/** An admin resource as the admin config carries it: columns normalised, permissions resolved. */
export type ResolvedAdminResource = {
    name: string;
    label: Label;
    labelSingular: Label;
    icon?: string;
    fields: Field[];
    columns: { field: string; sortable: boolean }[];
    search: boolean;
    methods: {
        list: ResolvedAdminResourceMethod;
        get?: ResolvedAdminResourceMethod;
        create?: ResolvedAdminResourceMethod;
        update?: ResolvedAdminResourceMethod;
        delete?: ResolvedAdminResourceMethod;
    };
};
