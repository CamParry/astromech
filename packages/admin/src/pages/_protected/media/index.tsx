/**
 * Media library route: search, sort, page, type and the open item in the URL,
 * rendered by `MediaListPage`.
 */

import { createFileRoute } from '@tanstack/react-router';
import {
    MediaListPage,
    validateMediaListSearch,
} from '../../../components/media/media-list-page';

export const Route = createFileRoute('/_protected/media/')({
    validateSearch: validateMediaListSearch,
    component: MediaListPage,
});
