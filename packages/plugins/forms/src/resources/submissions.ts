/**
 * The Submissions admin resource: a list and a read-only screen over stored
 * submissions. It names no `create` or `update`, since only `submit` writes one.
 */

import { defineAdminResource } from 'astromech';
import { submissionFields } from '../fields';

export const submissionsResource = defineAdminResource({
    name: 'submissions',
    label: 'Submissions',
    labelSingular: 'Submission',
    icon: 'Inbox',
    fields: submissionFields,
    columns: [
        { field: 'formSlug', sortable: true },
        'summary',
        { field: 'submittedAt', sortable: true },
    ],
    search: true,
    methods: {
        list: 'listSubmissions',
        get: 'getSubmission',
        delete: 'deleteSubmission',
    },
});
